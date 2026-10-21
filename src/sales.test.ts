import { describe, expect, it } from "vitest";
import type { Item } from "./db";
import { parseMoney, profitOf, saleFromItem } from "./sales";

const base = (extra: Partial<Item> = {}): Item => ({
  id: "i1", createdAt: 100, updatedAt: 200, status: "live", notes: "", photos: [], ...extra,
});

describe("parseMoney", () => {
  it("accepts dots, French commas and spaces", () => {
    expect(parseMoney("4.5")).toBe(4.5);
    expect(parseMoney(" 4,5 ")).toBe(4.5);
    expect(parseMoney("12")).toBe(12);
    expect(parseMoney("0")).toBe(0);
  });

  it("treats empty, negative and junk as no value", () => {
    expect(parseMoney("")).toBeUndefined();
    expect(parseMoney("  ")).toBeUndefined();
    expect(parseMoney("-3")).toBeUndefined();
    expect(parseMoney("abc")).toBeUndefined();
  });

  it("rounds to cents", () => {
    expect(parseMoney("1.239")).toBe(1.24);
  });
});

describe("saleFromItem", () => {
  const draft = { title: "Robe", brand: "Zara", category_path: "Femmes > Robes", size: "M", condition: "Très bon état" } as Item["draft"];

  it("copies the listing details, price history and the item's cost", () => {
    const item = base({ draft, listedPrice: 15, priceHistory: [{ price: 20, at: 1 }, { price: 15, at: 2 }], listedAt: 50, costPrice: 4, sourcedAt: 10 });
    expect(saleFromItem(item, { soldPrice: 14, shippingCost: 3.5, otherFees: 0.5 }, 999)).toEqual({
      itemId: "i1", title: "Robe", brand: "Zara", category_path: "Femmes > Robes", size: "M", condition: "Très bon état",
      firstPrice: 20, listedPrice: 15, soldPrice: 14, listedAt: 50, soldAt: 999,
      costPrice: 4, sourcedAt: 10, shippingCost: 3.5, otherFees: 0.5,
    });
  });

  it("falls back to the sold price and creation date for an item that was never priced", () => {
    const sale = saleFromItem(base(), { soldPrice: 9 }, 999);
    expect(sale).toMatchObject({ firstPrice: 9, listedPrice: 9, listedAt: 100, title: "" });
  });

  it("leaves out fields that are not set instead of storing undefined", () => {
    const sale = saleFromItem(base(), { soldPrice: 9 }, 999);
    expect(Object.keys(sale)).not.toContain("costPrice");
    expect(Object.keys(sale)).not.toContain("shippingCost");
    expect(Object.keys(sale)).not.toContain("paidAt");
  });

  it("takes shipping and fees from the form only, never from the item", () => {
    const item = { ...base(), shippingCost: 99 } as Item;
    expect(saleFromItem(item, { soldPrice: 9 }, 1)).not.toHaveProperty("shippingCost");
  });
});

describe("profitOf", () => {
  it("subtracts cost, shipping and fees", () => {
    expect(profitOf({ soldPrice: 20, costPrice: 5, shippingCost: 3, otherFees: 1 })).toEqual({ profit: 11, costKnown: true, marginPct: 55 });
  });

  it("flags a missing cost: the profit then ignores what you paid", () => {
    expect(profitOf({ soldPrice: 20, shippingCost: 3 })).toEqual({ profit: 17, costKnown: false, marginPct: undefined });
  });

  it("is not thrown off by floating point", () => {
    expect(profitOf({ soldPrice: 4.79, costPrice: 0.1 }).profit).toBe(4.69);
  });

  it("can be a loss", () => {
    expect(profitOf({ soldPrice: 5, costPrice: 8 })).toMatchObject({ profit: -3, costKnown: true, marginPct: -60 });
  });

  it("gives no margin for a free sale", () => {
    expect(profitOf({ soldPrice: 0, costPrice: 2 }).marginPct).toBeUndefined();
  });
});

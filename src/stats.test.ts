import { describe, expect, it } from "vitest";
import type { Item, Sale } from "./db";
import { agingStock, allTime, inRange, lastDays, monthly, summarise, thisMonth, thisYear, topBy } from "./stats";

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 21, 10); // 21 October 2026, 12:00 in Paris

function sale(extra: Partial<Sale> = {}): Sale {
  return {
    itemId: Math.random().toString(36), title: "t", brand: "Zara", category_path: "Femmes > Robes", size: "M", condition: "ok",
    firstPrice: 20, listedPrice: 20, soldPrice: 20, listedAt: NOW - 10 * DAY, soldAt: NOW - DAY, ...extra,
  };
}
const live = (extra: Partial<Item> = {}): Item => ({ id: Math.random().toString(36), createdAt: 1, updatedAt: 1, status: "live", notes: "", photos: [], ...extra });

describe("ranges", () => {
  it("this month and this year follow the Paris calendar", () => {
    expect(thisMonth(NOW)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(thisYear(NOW)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("puts the last Paris evening of a month in that month, not the next", () => {
    const october = thisMonth(NOW);
    expect(inRange(Date.UTC(2026, 9, 31, 21, 30), october)).toBe(true); // 22:30 in Paris
    expect(inRange(Date.UTC(2026, 9, 31, 23, 30), october)).toBe(false); // 00:30 on 1 November in Paris
  });

  it("counts the last n days including today, across the summer time change", () => {
    expect(lastDays(7, NOW)).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(lastDays(3, Date.UTC(2026, 9, 26, 10))).toEqual({ from: "2026-10-24", to: "2026-10-26" });
  });

  it("all time includes everything", () => {
    expect(inRange(0, allTime)).toBe(true);
    expect(inRange(NOW, allTime)).toBe(true);
  });
});

describe("summarise", () => {
  const sales = [
    sale({ soldPrice: 20, costPrice: 5, shippingCost: 3, otherFees: 1, soldAt: NOW - 2 * DAY, listedAt: NOW - 12 * DAY }), // profit 11
    sale({ soldPrice: 10, costPrice: 2, soldAt: NOW - DAY, listedAt: NOW - 5 * DAY }), // profit 8
    sale({ soldPrice: 30, soldAt: NOW - 3 * DAY, listedAt: NOW - 3 * DAY }), // no cost
    sale({ soldPrice: 99, soldAt: Date.UTC(2026, 8, 1) }), // September: outside October
  ];
  const items = [live(), live()];
  const s = summarise(sales, items, thisMonth(NOW));

  it("adds up the sales in range", () => {
    expect(s).toMatchObject({ count: 3, revenue: 60, cost: 7, shipping: 3, fees: 1, profit: 49, missingCost: 1 });
  });

  it("computes the margin only over sales that have a cost", () => {
    expect(s.marginPct).toBe(63.3); // (11 + 8) / (20 + 10)
  });

  it("averages price and days to sell", () => {
    expect(s.avgPrice).toBe(20);
    expect(s.avgDaysToSell).toBe(4.7); // (10 + 4 + 0) / 3
  });

  it("computes sell-through against what is still live", () => {
    expect(s.sellThrough).toBe(60); // 3 sold, 2 live
  });
});

describe("summarise edge cases", () => {
  it("has no averages for an empty range and no sell-through without any listing", () => {
    const s = summarise([], [], allTime);
    expect(s).toMatchObject({ count: 0, revenue: 0, profit: 0, missingCost: 0 });
    expect(s.avgPrice).toBeUndefined();
    expect(s.avgDaysToSell).toBeUndefined();
    expect(s.marginPct).toBeUndefined();
    expect(s.sellThrough).toBeUndefined();
  });

  it("has 0% sell-through when items are live but none sold", () => {
    expect(summarise([], [live()], allTime).sellThrough).toBe(0);
  });

  it("has no margin when no sale has a cost", () => {
    expect(summarise([sale()], [], allTime).marginPct).toBeUndefined();
  });

  it("ignores a negative duration (a sale dated before its listing)", () => {
    const s = summarise([sale({ listedAt: NOW, soldAt: NOW - DAY })], [], allTime);
    expect(s.avgDaysToSell).toBeUndefined();
  });
});

describe("monthly", () => {
  it("returns the last months oldest first, with empty months", () => {
    const rows = monthly([sale({ soldPrice: 10, soldAt: Date.UTC(2026, 7, 10) }), sale({ soldPrice: 30, costPrice: 10, soldAt: NOW })], 3, NOW);
    expect(rows.map((r) => r.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(rows.map((r) => r.revenue)).toEqual([10, 0, 30]);
    expect(rows.map((r) => r.profit)).toEqual([10, 0, 20]);
    expect(rows.map((r) => r.count)).toEqual([1, 0, 1]);
  });

  it("wraps over a year change", () => {
    const rows = monthly([], 3, Date.UTC(2027, 0, 15));
    expect(rows.map((r) => r.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("leaves out sales older than the window", () => {
    expect(monthly([sale({ soldAt: Date.UTC(2025, 0, 1) })], 3, NOW).every((r) => r.count === 0)).toBe(true);
  });
});

describe("agingStock", () => {
  const listed = (days: number, extra: Partial<Item> = {}) => live({ listedAt: NOW - days * DAY, listedPrice: 10, ...extra });

  it("buckets live items by days on sale, with the 30/31 and 90/91 boundaries", () => {
    const b = agingStock([listed(0), listed(30), listed(31), listed(60), listed(61), listed(90), listed(91), listed(400)], NOW);
    expect(b.map((x) => x.items.length)).toEqual([2, 2, 2, 2]);
    expect(b[3].label).toBe("90+ days");
  });

  it("adds up asking prices and known costs, and ignores items that are not live", () => {
    const b = agingStock([listed(5, { listedPrice: 12.5, costPrice: 3 }), listed(6, { listedPrice: 7.5 }), listed(5, { status: "sold" })], NOW);
    expect(b[0]).toMatchObject({ value: 20, cost: 3 });
    expect(b[0].items).toHaveLength(2);
  });

  it("falls back to the creation date when an item has no listing date", () => {
    const b = agingStock([live({ createdAt: NOW - 100 * DAY })], NOW);
    expect(b[3].items).toHaveLength(1);
  });
});

describe("topBy", () => {
  const rows = [
    sale({ brand: "Zara", soldPrice: 10 }),
    sale({ brand: "Zara", soldPrice: 15, costPrice: 5 }),
    sale({ brand: "Nike", soldPrice: 40 }),
    sale({ brand: "  ", soldPrice: 5 }),
  ];

  it("groups, sorts by revenue and counts", () => {
    expect(topBy(rows, "brand", 10)).toEqual([
      { name: "Nike", count: 1, revenue: 40, profit: 40 },
      { name: "Zara", count: 2, revenue: 25, profit: 20 },
      { name: "Unknown", count: 1, revenue: 5, profit: 5 },
    ]);
  });

  it("limits the list", () => {
    expect(topBy(rows, "brand", 1)).toHaveLength(1);
  });

  it("can group by category", () => {
    expect(topBy(rows, "category_path", 5)).toEqual([{ name: "Femmes > Robes", count: 4, revenue: 70, profit: 65 }]);
  });
});

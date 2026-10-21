import { describe, expect, it } from "vitest";
import type { Item, Sale } from "./db";
import { purchasesRegister, receiptsRegister, thresholdProgress, yearTotals, type ThresholdSpec } from "./pro";

const sale = (extra: Partial<Sale> = {}): Sale => ({
  itemId: "aaaaaaaa-1111", title: "Robe", brand: "", category_path: "", size: "", condition: "", firstPrice: 10, listedPrice: 10,
  soldPrice: 10, listedAt: Date.UTC(2026, 0, 1), soldAt: Date.UTC(2026, 5, 15, 12), ...extra,
});
const item = (extra: Partial<Item> = {}): Item => ({ id: "bbbbbbbb-2222", createdAt: Date.UTC(2026, 2, 1, 12), updatedAt: 1, status: "draft", notes: "", photos: [], ...extra });

describe("yearTotals", () => {
  it("counts sales by the day the money was received", () => {
    const sales = [
      sale({ soldPrice: 20, soldAt: Date.UTC(2026, 11, 30, 12), paidAt: Date.UTC(2027, 0, 3, 12) }), // sold 2026, paid 2027
      sale({ soldPrice: 5, soldAt: Date.UTC(2026, 5, 1, 12) }),
    ];
    expect(yearTotals(sales, 2026)).toEqual({ year: 2026, count: 1, turnover: 5 });
    expect(yearTotals(sales, 2027)).toEqual({ year: 2027, count: 1, turnover: 20 });
  });

  it("uses the Paris calendar around new year", () => {
    const lateEve = sale({ soldPrice: 8, soldAt: Date.UTC(2026, 11, 31, 23, 30) }); // 00:30 on 1 January in Paris
    expect(yearTotals([lateEve], 2027).count).toBe(1);
    expect(yearTotals([lateEve], 2026).count).toBe(0);
  });

  it("adds up to cents", () => {
    expect(yearTotals([sale({ soldPrice: 0.1 }), sale({ soldPrice: 0.2 })], 2026).turnover).toBe(0.3);
  });

  it("is empty for a year with no sales", () => {
    expect(yearTotals([], 2026)).toEqual({ year: 2026, count: 0, turnover: 0 });
  });
});

describe("thresholdProgress", () => {
  const eur = (limit: number | null, inclusive = false): ThresholdSpec => ({ key: "t", label: "T", unit: "eur", limit, inclusive });
  const totals = (turnover: number, count = 0) => ({ year: 2026, count, turnover });
  const status = (t: ReturnType<typeof totals>, spec: ThresholdSpec) => thresholdProgress(t, [spec])[0].status;

  it("is below, near (from 80%) and over", () => {
    expect(status(totals(700), eur(1000))).toBe("below");
    expect(status(totals(800), eur(1000))).toBe("near");
    expect(status(totals(1001), eur(1000))).toBe("over");
  });

  it("treats exactly the limit as near unless reaching it already counts", () => {
    expect(status(totals(1000), eur(1000))).toBe("near");
    expect(status(totals(1000), eur(1000, true))).toBe("over");
  });

  it("is unknown for an unverified limit and never guesses a percentage", () => {
    const [p] = thresholdProgress(totals(5000), [eur(null)]);
    expect(p).toMatchObject({ status: "unknown", pct: undefined, used: 5000 });
  });

  it("measures a count threshold against the number of sales", () => {
    const spec: ThresholdSpec = { key: "n", label: "N", unit: "count", limit: 30, inclusive: true };
    const [p] = thresholdProgress(totals(9999, 24), [spec]);
    expect(p).toMatchObject({ used: 24, pct: 80, status: "near" });
  });

  it("reports a percentage above 100 when over", () => {
    expect(thresholdProgress(totals(1500), [eur(1000)])[0].pct).toBe(150);
  });
});

describe("receiptsRegister", () => {
  it("lists the year's sales by payment date, oldest first, in Paris dates", () => {
    const rows = receiptsRegister(
      [
        sale({ itemId: "bbbbbbbb", title: "Pull", soldPrice: 12, soldAt: Date.UTC(2026, 8, 5, 12) }),
        sale({ itemId: "aaaaaaaa", title: "Robe", soldPrice: 20, soldAt: Date.UTC(2026, 7, 1, 12), paidAt: Date.UTC(2026, 7, 4, 12) }),
        sale({ itemId: "cccccccc", soldAt: Date.UTC(2025, 5, 1, 12) }),
      ],
      2026,
    );
    expect(rows).toEqual([
      { date: "2026-08-04", ref: "AAAAAAAA", description: "Robe", amount: 20, method: "Vinted" },
      { date: "2026-09-05", ref: "BBBBBBBB", description: "Pull", amount: 12, method: "Vinted" },
    ]);
  });

  it("names an untitled item", () => {
    expect(receiptsRegister([sale({ title: "" })], 2026)[0].description).toBe("Article");
  });
});

describe("purchasesRegister", () => {
  it("includes the cost of a sale even when its item was deleted", () => {
    const rows = purchasesRegister([sale({ itemId: "dddddddd", costPrice: 4, sourcedAt: Date.UTC(2026, 3, 2, 12) })], [], 2026);
    expect(rows).toEqual([{ date: "2026-04-02", ref: "DDDDDDDD", description: "Robe", amount: 4, dateEstimated: false }]);
  });

  it("includes unsold items with a cost, dated by purchase date or creation date", () => {
    const rows = purchasesRegister(
      [],
      [item({ id: "eeeeeeee", costPrice: 3, sourcedAt: Date.UTC(2026, 0, 10, 12) }), item({ id: "ffffffff", costPrice: 6 })],
      2026,
    );
    expect(rows.map((r) => [r.ref, r.date, r.dateEstimated])).toEqual([["EEEEEEEE", "2026-01-10", false], ["FFFFFFFF", "2026-03-01", true]]);
  });

  it("never lists one purchase twice: a sold item counts through its sale only", () => {
    const rows = purchasesRegister([sale({ itemId: "gggggggg", costPrice: 4 })], [item({ id: "gggggggg", status: "sold", costPrice: 4 })], 2026);
    expect(rows).toHaveLength(1);
  });

  it("estimates the date from the listing date when no purchase date was entered", () => {
    const [row] = purchasesRegister([sale({ costPrice: 2, listedAt: Date.UTC(2026, 1, 3, 12) })], [], 2026);
    expect(row).toMatchObject({ date: "2026-02-03", dateEstimated: true });
  });

  it("skips items and sales without a cost, and other years", () => {
    const rows = purchasesRegister([sale(), sale({ itemId: "hhhhhhhh", costPrice: 4, sourcedAt: Date.UTC(2025, 5, 1, 12) })], [item()], 2026);
    expect(rows).toEqual([]);
  });
});

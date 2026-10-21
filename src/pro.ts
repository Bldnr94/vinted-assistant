// What a professional seller needs from the same sales data: yearly turnover against thresholds, and the
// two registers (receipts and purchases). Pure. The thresholds are passed in with their sources by
// proThresholds.ts; this file knows no figures and gives no tax advice.
import type { Item, Sale } from "./db";
import { round2, toDateInput, yearOf } from "./format";

export interface ThresholdSpec {
  key: string;
  label: string;
  unit: "eur" | "count";
  limit: number | null; // null: not verified, shown as unknown
  inclusive?: boolean; // true when reaching the limit already counts (otherwise it has to be exceeded)
  note?: string; // how the official rule measures it, shown under the figure
  sourceUrl?: string;
}

export type ThresholdStatus = "below" | "near" | "over" | "unknown";

// The date a sale counts for in the registers: when the money reached you, else when it sold.
export const receivedAt = (s: Sale) => s.paidAt ?? s.soldAt;

export interface YearTotals {
  year: number;
  count: number;
  turnover: number;
}

export function yearTotals(sales: Sale[], year: number): YearTotals {
  const inYear = sales.filter((s) => yearOf(receivedAt(s)) === year);
  return { year, count: inYear.length, turnover: round2(inYear.reduce((n, s) => n + s.soldPrice, 0)) };
}

export interface Progress {
  spec: ThresholdSpec;
  used: number;
  pct: number | undefined; // may exceed 100
  status: ThresholdStatus;
}

const NEAR = 0.8;

export function thresholdProgress(totals: YearTotals, specs: ThresholdSpec[]): Progress[] {
  return specs.map((spec) => {
    const used = spec.unit === "count" ? totals.count : totals.turnover;
    if (spec.limit === null || !(spec.limit > 0)) return { spec, used, pct: undefined, status: "unknown" };
    const reached = spec.inclusive ? used >= spec.limit : used > spec.limit;
    const status: ThresholdStatus = reached ? "over" : used >= spec.limit * NEAR ? "near" : "below";
    return { spec, used, pct: Math.round((used / spec.limit) * 1000) / 10, status };
  });
}

export interface ReceiptRow {
  date: string; // YYYY-MM-DD, Paris time
  ref: string;
  description: string;
  amount: number;
  method: string;
}

export interface PurchaseRow {
  date: string;
  ref: string;
  description: string;
  amount: number;
  dateEstimated: boolean; // no purchase date was entered; the date it went on sale (or was created) stands in
}

const refOf = (id: string) => id.slice(0, 8).toUpperCase();
const byDateThenRef = (a: { date: string; ref: string }, b: { date: string; ref: string }) =>
  a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref);

export function receiptsRegister(sales: Sale[], year: number): ReceiptRow[] {
  return sales
    .filter((s) => yearOf(receivedAt(s)) === year)
    .map((s) => ({ date: toDateInput(receivedAt(s)), ref: refOf(s.itemId), description: s.title || "Article", amount: s.soldPrice, method: "Vinted" }))
    .sort(byDateThenRef);
}

// Costs of sold items come from their sale rows, which outlive a deleted item; items not sold yet
// (draft or live) contribute their own cost. One purchase is never listed twice.
export function purchasesRegister(sales: Sale[], items: Item[], year: number): PurchaseRow[] {
  const rows: PurchaseRow[] = [];
  for (const s of sales) {
    if (s.costPrice === undefined) continue;
    rows.push({ date: toDateInput(s.sourcedAt ?? s.listedAt), ref: refOf(s.itemId), description: s.title || "Article", amount: s.costPrice, dateEstimated: s.sourcedAt === undefined });
  }
  for (const i of items) {
    if (i.status === "sold" || i.costPrice === undefined) continue;
    rows.push({ date: toDateInput(i.sourcedAt ?? i.createdAt), ref: refOf(i.id), description: i.draft?.title || "Article", amount: i.costPrice, dateEstimated: i.sourcedAt === undefined });
  }
  return rows.filter((r) => Number(r.date.slice(0, 4)) === year).sort(byDateThenRef);
}

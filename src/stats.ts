// Numbers for the Stats and Sales screens. Pure: sales and items in, figures out.
// Ranges are Paris calendar days ("YYYY-MM-DD", both ends included), so a sale made late on the
// last evening of a month or year lands in the right one whatever the device's time zone.
import type { Item, Sale } from "./db";
import { monthKey, round2, toDateInput, yearOf, fromDateInput } from "./format";
import { profitOf } from "./sales";

const DAY = 24 * 60 * 60 * 1000;

export interface Range {
  from: string;
  to: string;
}

export const allTime: Range = { from: "0000-00-00", to: "9999-99-99" };
export const thisMonth = (now: number): Range => {
  const m = monthKey(now);
  return { from: `${m}-01`, to: `${m}-31` };
};
export const thisYear = (now: number): Range => {
  const y = yearOf(now);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
};
// The last n days including today. Counting back from noon UTC keeps it exact across summer time changes.
export const lastDays = (n: number, now: number): Range => ({
  from: toDateInput(fromDateInput(toDateInput(now))! - (n - 1) * DAY),
  to: toDateInput(now),
});

export const inRange = (t: number, r: Range) => {
  const d = toDateInput(t);
  return d >= r.from && d <= r.to;
};

export interface Summary {
  count: number;
  revenue: number;
  cost: number; // only the sales where you entered what you paid
  shipping: number;
  fees: number;
  profit: number; // revenue minus cost, shipping and fees; a sale without a cost counts as cost 0
  missingCost: number; // sales without a cost: the profit is partial while this is above 0
  marginPct: number | undefined; // over the sales that have a cost, so a missing cost does not inflate it
  avgPrice: number | undefined;
  avgDaysToSell: number | undefined;
  sellThrough: number | undefined; // sold in the range / (sold in the range + live now), in %
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const oneDecimal = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10);

export function summarise(sales: Sale[], items: Item[], range: Range): Summary {
  const inside = sales.filter((s) => inRange(s.soldAt, range));
  const sum = (f: (s: Sale) => number) => round2(inside.reduce((n, s) => n + f(s), 0));
  const withCost = inside.filter((s) => s.costPrice !== undefined);
  const knownProfit = withCost.reduce((n, s) => n + profitOf(s).profit, 0);
  const knownRevenue = withCost.reduce((n, s) => n + s.soldPrice, 0);
  const live = items.filter((i) => i.status === "live").length;
  return {
    count: inside.length,
    revenue: sum((s) => s.soldPrice),
    cost: sum((s) => s.costPrice ?? 0),
    shipping: sum((s) => s.shippingCost ?? 0),
    fees: sum((s) => s.otherFees ?? 0),
    profit: sum((s) => profitOf(s).profit),
    missingCost: inside.length - withCost.length,
    marginPct: knownRevenue > 0 ? oneDecimal((knownProfit / knownRevenue) * 100) : undefined,
    avgPrice: inside.length ? round2(mean(inside.map((s) => s.soldPrice))!) : undefined,
    avgDaysToSell: oneDecimal(mean(inside.map((s) => (s.soldAt - s.listedAt) / DAY).filter((d) => d >= 0))),
    sellThrough: inside.length + live > 0 ? oneDecimal((inside.length / (inside.length + live)) * 100) : undefined,
  };
}

export interface MonthTotal {
  month: string; // "2026-04"
  revenue: number;
  profit: number;
  count: number;
}

// The last `count` months ending with the current one, oldest first, empty months included.
export function monthly(sales: Sale[], count: number, now: number): MonthTotal[] {
  const [year, month] = monthKey(now).split("-").map(Number);
  const out: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = year * 12 + (month - 1) - i;
    out.push({ month: `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`, revenue: 0, profit: 0, count: 0 });
  }
  const byMonth = new Map(out.map((m) => [m.month, m]));
  for (const s of sales) {
    const m = byMonth.get(monthKey(s.soldAt));
    if (!m) continue;
    m.revenue = round2(m.revenue + s.soldPrice);
    m.profit = round2(m.profit + profitOf(s).profit);
    m.count++;
  }
  return out;
}

export interface AgeBucket {
  label: string;
  minDays: number;
  items: Item[];
  value: number; // the asking prices added up
  cost: number; // what you paid, where known
}

const BUCKETS: [string, number][] = [["0-30 days", 0], ["31-60 days", 31], ["61-90 days", 61], ["90+ days", 91]];

// Live items by how long they have been on sale; the oldest bucket is the one to act on.
export function agingStock(items: Item[], now: number): AgeBucket[] {
  const buckets: AgeBucket[] = BUCKETS.map(([label, minDays]) => ({ label, minDays, items: [], value: 0, cost: 0 }));
  for (const item of items) {
    if (item.status !== "live") continue;
    const days = Math.max(0, Math.floor((now - (item.listedAt ?? item.createdAt)) / DAY));
    const bucket = [...buckets].reverse().find((b) => days >= b.minDays)!;
    bucket.items.push(item);
    bucket.value = round2(bucket.value + (item.listedPrice ?? 0));
    bucket.cost = round2(bucket.cost + (item.costPrice ?? 0));
  }
  return buckets;
}

export interface TopRow {
  name: string;
  count: number;
  revenue: number;
  profit: number;
}

export function topBy(sales: Sale[], key: "brand" | "category_path", n: number): TopRow[] {
  const rows = new Map<string, TopRow>();
  for (const s of sales) {
    const name = s[key].trim() || "Unknown";
    const row = rows.get(name) ?? { name, count: 0, revenue: 0, profit: 0 };
    row.count++;
    row.revenue = round2(row.revenue + s.soldPrice);
    row.profit = round2(row.profit + profitOf(s).profit);
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)).slice(0, n);
}

// Turning a sold item into a Sale row, and what it earned. Pure: no storage, no screens.
import type { Item, Sale } from "./db";
import { round2 } from "./format";

export interface SaleInput {
  soldPrice: number;
  shippingCost?: number; // shipping you paid yourself
  otherFees?: number;
  paidAt?: number; // when the money reached you; soldAt when absent
}

// Euros as typed: "4,5", " 12 " and "" are fine; anything negative or not a number counts as empty.
export function parseMoney(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? round2(n) : undefined;
}

const withoutUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// Shipping and fees belong to the sale only; the cost price comes from the item.
export function saleFromItem(item: Item, input: SaleInput, now: number): Sale {
  const d = item.draft;
  return withoutUndefined({
    itemId: item.id,
    title: d?.title ?? "",
    brand: d?.brand ?? "",
    category_path: d?.category_path ?? "",
    size: d?.size ?? "",
    condition: d?.condition ?? "",
    firstPrice: item.priceHistory?.[0]?.price ?? item.listedPrice ?? input.soldPrice,
    listedPrice: item.listedPrice ?? input.soldPrice,
    soldPrice: input.soldPrice,
    listedAt: item.listedAt ?? item.createdAt,
    soldAt: now,
    costPrice: item.costPrice,
    sourcedAt: item.sourcedAt,
    shippingCost: input.shippingCost,
    otherFees: input.otherFees,
    paidAt: input.paidAt,
  });
}

export interface Profit {
  profit: number;
  costKnown: boolean; // false: the profit does not include what you paid for the item
  marginPct: number | undefined; // profit as a share of the sold price, one decimal; undefined without a cost
}

export function profitOf(s: Pick<Sale, "soldPrice" | "costPrice" | "shippingCost" | "otherFees">): Profit {
  const profit = round2(s.soldPrice - (s.costPrice ?? 0) - (s.shippingCost ?? 0) - (s.otherFees ?? 0));
  const costKnown = s.costPrice !== undefined;
  return {
    profit,
    costKnown,
    marginPct: costKnown && s.soldPrice > 0 ? Math.round((profit / s.soldPrice) * 1000) / 10 : undefined,
  };
}

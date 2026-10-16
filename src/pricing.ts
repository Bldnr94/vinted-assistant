// Price-drop reminders: which live items have waited long enough, and what to lower them to.
// Nothing here touches Vinted; you change the price there yourself.
import type { Item } from "./db";

export interface DropSettings {
  afterDays: number; // remind when the price hasn't changed for this many days
  percent: number; // suggested cut
  snoozeDays: number; // "Not yet" waits this long
}

const SETTINGS_KEY = "price-drop-settings";
export const DEFAULT_DROP: DropSettings = { afterDays: 14, percent: 12, snoozeDays: 7 };
const DAY = 24 * 60 * 60 * 1000;

export function readDropSettings(): DropSettings {
  try {
    return { ...DEFAULT_DROP, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_DROP;
  }
}

export function saveDropSettings(s: DropSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private window or blocked storage: the defaults stay in use.
  }
}

// The floor offered when an item goes live: the low end of the drafted range, or 70% of the price.
export function defaultFloor(price: number, rangeMin?: number): number {
  if (rangeMin && rangeMin > 0 && rangeMin < price) return Math.round(rangeMin);
  return Math.max(1, Math.round(price * 0.7));
}

// When the current price was set: the latest change, or the day it went live.
export function priceSince(item: Item): number {
  const last = item.priceHistory?.at(-1)?.at;
  return last ?? item.listedAt ?? item.updatedAt;
}

export const daysSince = (t: number, now = Date.now()) => Math.floor((now - t) / DAY);

// Whole euros, at least 1 € lower, never below the floor. Undefined when it is already at the floor.
export function suggestedDrop(price: number, floor: number | undefined, percent: number): number | undefined {
  const min = Math.max(1, floor ?? 1);
  let next = Math.floor(price * (1 - percent / 100));
  if (next > price - 1) next = Math.floor(price - 1);
  next = Math.max(next, Math.ceil(min));
  return next < price ? next : undefined;
}

export interface DueDrop {
  item: Item;
  days: number;
  suggested: number;
}

export function dueDrops(items: Item[], s: DropSettings, now = Date.now()): DueDrop[] {
  const due: DueDrop[] = [];
  for (const item of items) {
    if (item.status !== "live" || item.listedPrice === undefined) continue;
    if (item.snoozedUntil && item.snoozedUntil > now) continue;
    const days = daysSince(priceSince(item), now);
    if (days < s.afterDays) continue;
    const suggested = suggestedDrop(item.listedPrice, item.floorPrice, s.percent);
    if (suggested !== undefined) due.push({ item, days, suggested });
  }
  return due.sort((a, b) => b.days - a.days);
}

export const snoozed = (item: Item, s: DropSettings, now = Date.now()): Item => ({
  ...item,
  snoozedUntil: now + s.snoozeDays * DAY,
});

export const repriced = (item: Item, price: number, now = Date.now()): Item => ({
  ...item,
  listedPrice: price,
  priceHistory: [...(item.priceHistory ?? []), { price, at: now }],
  snoozedUntil: undefined,
});

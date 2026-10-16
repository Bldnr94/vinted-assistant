// Items, their photos and your AI model photos live in the phone browser's IndexedDB.
import type { Draft, ShotKind } from "../shared/listing";
import { defaultFloor } from "./pricing";

export interface Photo {
  id: string;
  // "ai_model" photos are AI illustrations: always placed after every real photo.
  kind: ShotKind | "ai_model";
  blob: Blob; // resized JPEG as shot, or the AI image
  addedAt: number;
  improved?: Blob; // same photo on a studio background, garment pixels unchanged
  useImproved?: boolean;
  colourShift?: number; // 0-255 average channel difference measured on the garment
  include?: boolean; // AI images only: false until you approve it
}

// draft: not on Vinted yet. live: you published it. sold: you marked it sold.
export type ItemStatus = "draft" | "live" | "sold";

export interface PriceChange {
  price: number;
  at: number;
}

export interface Item {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: ItemStatus;
  notes: string;
  photos: Photo[];
  draft?: Draft;
  draftModel?: string;
  draftTokens?: { input_tokens: number; output_tokens: number };
  listedPrice?: number; // current asking price on Vinted
  listedAt?: number;
  priceHistory?: PriceChange[]; // first entry is the price it went live at
  vintedUrl?: string; // optional, to open the listing from a reminder
  floorPrice?: number; // price-drop suggestions never go below this
  snoozedUntil?: number; // no price-drop reminder before this time
  soldAt?: number;
  soldPrice?: number;
  draftState?: "queued" | "drafting" | "failed"; // batch mode's background drafting queue
  draftError?: string;
}

// One row per sale, kept when the item and its photos are deleted, to feed price suggestions later.
export interface Sale {
  itemId: string;
  title: string;
  brand: string;
  category_path: string;
  size: string;
  condition: string;
  firstPrice: number;
  listedPrice: number;
  soldPrice: number;
  listedAt: number;
  soldAt: number;
}

export interface ModelPose {
  id: string;
  blob: Blob; // JPEG of your AI model, reused for every try-on
  createdAt: number;
  prompt?: string; // what made it; empty for an uploaded photo
}

const DB_NAME = "vinted-assistant";
const ITEMS = "items";
const POSES = "model-poses";
const SALES = "sales";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(POSES)) db.createObjectStore(POSES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SALES)) db.createObjectStore(SALES, { keyPath: "itemId" });
      // Version 3: "listed" became "live", with the date and price it went live at.
      if (e.oldVersion > 0 && e.oldVersion < 3) {
        const cursor = req.transaction!.objectStore(ITEMS).openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          const item = c.value as Omit<Item, "status"> & { status: string };
          if (item.status === "listed") {
            const at = item.updatedAt;
            const price = item.listedPrice ?? item.draft?.price_suggested_eur;
            c.update({
              ...item,
              status: "live",
              listedAt: at,
              listedPrice: price,
              priceHistory: price === undefined ? [] : [{ price, at }],
              floorPrice: price === undefined ? undefined : defaultFloor(price, item.draft?.price_min_eur),
            });
          }
          c.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listItems = async (): Promise<Item[]> =>
  (await run<Item[]>(ITEMS, "readonly", (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt);

export const getItem = (id: string) => run<Item | undefined>(ITEMS, "readonly", (s) => s.get(id));

export const saveItem = (item: Item) => run(ITEMS, "readwrite", (s) => s.put({ ...item, updatedAt: Date.now() }));

export const deleteItem = (id: string) => run(ITEMS, "readwrite", (s) => s.delete(id));

export const listSales = () => run<Sale[]>(SALES, "readonly", (s) => s.getAll());

export const saveSale = (sale: Sale) => run(SALES, "readwrite", (s) => s.put(sale));

export const deleteSale = (itemId: string) => run(SALES, "readwrite", (s) => s.delete(itemId));

export function newItem(): Item {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: "draft", notes: "", photos: [] };
}

export const listPoses = async (): Promise<ModelPose[]> =>
  (await run<ModelPose[]>(POSES, "readonly", (s) => s.getAll())).sort((a, b) => a.createdAt - b.createdAt);

export const savePose = (pose: ModelPose) => run(POSES, "readwrite", (s) => s.put(pose));

export const deletePose = (id: string) => run(POSES, "readwrite", (s) => s.delete(id));

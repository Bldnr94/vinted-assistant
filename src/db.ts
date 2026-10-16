// Items, their photos and your AI model photos live in the phone browser's IndexedDB.
import type { Draft, ShotKind } from "../shared/listing";

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

export interface Item {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "draft" | "listed";
  notes: string;
  photos: Photo[];
  draft?: Draft;
  draftModel?: string;
  draftTokens?: { input_tokens: number; output_tokens: number };
  listedPrice?: number;
  draftState?: "queued" | "drafting" | "failed"; // batch mode's background drafting queue
  draftError?: string;
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

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(POSES)) db.createObjectStore(POSES, { keyPath: "id" });
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

export function newItem(): Item {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: "draft", notes: "", photos: [] };
}

export const listPoses = async (): Promise<ModelPose[]> =>
  (await run<ModelPose[]>(POSES, "readonly", (s) => s.getAll())).sort((a, b) => a.createdAt - b.createdAt);

export const savePose = (pose: ModelPose) => run(POSES, "readwrite", (s) => s.put(pose));

export const deletePose = (id: string) => run(POSES, "readwrite", (s) => s.delete(id));

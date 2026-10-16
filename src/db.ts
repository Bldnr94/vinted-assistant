// Items and their photos live in the phone browser's IndexedDB.
import type { Draft, ShotKind } from "../shared/listing";

export interface Photo {
  id: string;
  kind: ShotKind;
  blob: Blob; // resized JPEG
  addedAt: number;
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
}

const DB_NAME = "vinted-assistant";
const STORE = "items";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listItems = async (): Promise<Item[]> =>
  (await run<Item[]>("readonly", (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt);

export const getItem = (id: string) => run<Item | undefined>("readonly", (s) => s.get(id));

export const saveItem = (item: Item) =>
  run("readwrite", (s) => s.put({ ...item, updatedAt: Date.now() }));

export const deleteItem = (id: string) => run("readwrite", (s) => s.delete(id));

export function newItem(): Item {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: "draft", notes: "", photos: [] };
}

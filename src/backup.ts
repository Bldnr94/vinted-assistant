// Backup: everything in IndexedDB plus a few settings, as one zip file you keep.
// The app token is a secret and is never exported, and a backup that contains one is not applied.
import {
  listItems,
  listPoses,
  listSales,
  putAllRaw,
  replaceAll,
  stripLegacyPhotoFields,
  type Item,
  type ModelPose,
  type Photo,
  type Rows,
  type Sale,
} from "./db";
import { openZip, zipBlobs, type ZipEntry } from "./zip";

export const SCHEMA_VERSION = 3; // the IndexedDB version the data was exported from
export const BACKUP_SETTING_KEYS = ["price-drop-settings", "reply-settings", "studio-backdrop", "inventory-filter"];
const LAST_BACKUP_KEY = "last-backup-at";

interface BlobRef {
  path: string;
  type: string;
}
type ManifestPhoto = Omit<Photo, "blob" | "fixed" | "improved"> & { blob: BlobRef; fixed?: BlobRef; improved?: BlobRef };
type ManifestItem = Omit<Item, "photos"> & { photos: ManifestPhoto[] };
type ManifestPose = Omit<ModelPose, "blob"> & { blob: BlobRef };

export interface Manifest {
  app: "vinted-assistant";
  schemaVersion: number;
  exportedAt: number;
  items: ManifestItem[];
  sales: Sale[];
  poses: ManifestPose[];
  settings: Record<string, string>;
}

export class BackupError extends Error {}

const EXTENSION: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

// Photo files go in the zip as they are; only the JSON manifest refers to them.
export function buildEntries(rows: Rows, settings: Record<string, string>, now = Date.now()): ZipEntry[] {
  const files: ZipEntry[] = [];
  const add = (base: string, blob: Blob): BlobRef => {
    const path = base + (EXTENSION[blob.type] ?? ".bin");
    files.push({ name: path, data: blob });
    return { path, type: blob.type };
  };

  const items: ManifestItem[] = rows.items.map((item) => ({
    ...item,
    photos: item.photos
      .filter((p) => p.blob instanceof Blob)
      .map((p) => {
        const base = `photos/${item.id}/${p.id}`;
        return {
          id: p.id,
          kind: p.kind,
          addedAt: p.addedAt,
          useFixed: p.useFixed,
          useImproved: p.useImproved,
          include: p.include,
          blob: add(`${base}/blob`, p.blob),
          ...(p.fixed instanceof Blob ? { fixed: add(`${base}/fixed`, p.fixed) } : {}),
          ...(p.improved instanceof Blob ? { improved: add(`${base}/improved`, p.improved) } : {}),
        };
      }),
  }));
  const poses: ManifestPose[] = rows.poses
    .filter((p) => p.blob instanceof Blob)
    .map((p) => ({ id: p.id, createdAt: p.createdAt, prompt: p.prompt, blob: add(`poses/${p.id}`, p.blob) }));

  const manifest: Manifest = {
    app: "vinted-assistant",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    items,
    sales: rows.sales,
    poses,
    settings: pickSettings(settings),
  };
  const json = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  return [{ name: "manifest.json", data: json }, ...files];
}

export const buildBackupBlob = async (rows: Rows, settings: Record<string, string>, now?: number) =>
  zipBlobs(buildEntries(rows, settings, now));

function pickSettings(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BACKUP_SETTING_KEYS) if (typeof all[key] === "string") out[key] = all[key];
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || isNum(v);
const STATUSES = ["draft", "live", "sold"];

// A malformed file must fail here, not later inside a screen that cannot cope with it.
export function validateManifest(m: unknown, has: (path: string) => boolean): Manifest {
  const bad = (what: string): never => {
    throw new BackupError(`The backup is damaged or incomplete (${what}).`);
  };
  const ref = (r: unknown, what: string) => {
    if (!isObj(r) || typeof r.path !== "string" || typeof r.type !== "string" || !has(r.path)) bad(`missing ${what}`);
  };

  if (!isObj(m) || m.app !== "vinted-assistant") throw new BackupError("This file is not a Vinted Assistant backup.");
  if (!isNum(m.schemaVersion)) bad("no version");
  if ((m.schemaVersion as number) > SCHEMA_VERSION) {
    throw new BackupError("This backup was made by a newer version of the app. Update the app, then import it.");
  }
  if (!Array.isArray(m.items) || !Array.isArray(m.sales) || !Array.isArray(m.poses)) bad("missing lists");

  for (const item of m.items as unknown[]) {
    if (!isObj(item) || typeof item.id !== "string" || !isNum(item.createdAt) || !isNum(item.updatedAt)) bad("an item");
    const it = item as Record<string, unknown>;
    if (!STATUSES.includes(it.status as string) || !Array.isArray(it.photos)) bad("an item");
    for (const k of ["listedPrice", "floorPrice", "soldPrice", "listedAt", "soldAt"]) if (!optNum(it[k])) bad("an item price or date");
    for (const photo of it.photos as unknown[]) {
      if (!isObj(photo) || typeof photo.id !== "string" || typeof photo.kind !== "string" || !isNum(photo.addedAt)) bad("a photo");
      const p = photo as Record<string, unknown>;
      ref(p.blob, "a photo file");
      if (p.fixed !== undefined) ref(p.fixed, "a photo file");
      if (p.improved !== undefined) ref(p.improved, "a photo file");
    }
  }
  for (const sale of m.sales as unknown[]) {
    if (!isObj(sale) || typeof sale.itemId !== "string" || !isNum(sale.soldPrice) || !isNum(sale.soldAt)) bad("a sale");
  }
  for (const pose of m.poses as unknown[]) {
    if (!isObj(pose) || typeof pose.id !== "string" || !isNum(pose.createdAt)) bad("a model photo");
    ref((pose as Record<string, unknown>).blob, "a model photo file");
  }
  if (m.settings !== undefined && !isObj(m.settings)) bad("settings");
  return { ...(m as unknown as Manifest), settings: pickSettings(isObj(m.settings) ? (m.settings as Record<string, string>) : {}) };
}

export interface ParsedBackup extends Rows {
  exportedAt: number;
  settings: Record<string, string>;
  fileSize: number;
}

export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  const zip = await openZip(file);
  if (!zip.has("manifest.json")) throw new BackupError("This file is not a Vinted Assistant backup.");
  let raw: unknown;
  const text = await zip.text("manifest.json");
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("The backup's manifest cannot be read.");
  }
  const manifest = validateManifest(raw, zip.has);
  const get = (r: BlobRef) => zip.blob(r.path, r.type);

  const items: Item[] = [];
  for (const mi of manifest.items) {
    const photos: Photo[] = [];
    for (const mp of mi.photos) {
      photos.push({
        id: mp.id,
        kind: mp.kind,
        addedAt: mp.addedAt,
        useFixed: mp.useFixed,
        useImproved: mp.useImproved,
        include: mp.include,
        blob: await get(mp.blob),
        ...(mp.fixed ? { fixed: await get(mp.fixed) } : {}),
        ...(mp.improved ? { improved: await get(mp.improved) } : {}),
      });
    }
    items.push(stripLegacyPhotoFields({ ...mi, photos }));
  }
  const poses: ModelPose[] = [];
  for (const mp of manifest.poses) poses.push({ id: mp.id, createdAt: mp.createdAt, prompt: mp.prompt, blob: await get(mp.blob) });

  return { exportedAt: manifest.exportedAt, items, sales: manifest.sales, poses, settings: manifest.settings, fileSize: file.size };
}

export interface MergePlan {
  write: Rows;
  counts: { itemsAdded: number; itemsUpdated: number; itemsKept: number; salesWritten: number; posesAdded: number };
}

// Merge never deletes anything. Per item the newer updatedAt wins; a sale follows the item that won
// (a sale whose item no longer exists is kept, as sales outlive their items); model photos are a union.
// Items deleted since the backup was made come back.
export function planMerge(existing: Rows, incoming: Rows): MergePlan {
  const have = new Map(existing.items.map((i) => [i.id, i]));
  const theirs = new Map(incoming.items.map((i) => [i.id, i]));
  const counts = { itemsAdded: 0, itemsUpdated: 0, itemsKept: 0, salesWritten: 0, posesAdded: 0 };

  const items: Item[] = [];
  for (const item of incoming.items) {
    const mine = have.get(item.id);
    if (!mine) {
      items.push(item);
      counts.itemsAdded++;
    } else if (item.updatedAt > mine.updatedAt) {
      items.push(item);
      counts.itemsUpdated++;
    } else counts.itemsKept++;
  }
  const won = (itemId: string): "incoming" | "existing" | "none" => {
    const t = theirs.get(itemId);
    const m = have.get(itemId);
    if (t && (!m || t.updatedAt > m.updatedAt)) return "incoming";
    return m ? "existing" : "none";
  };

  const haveSale = new Set(existing.sales.map((s) => s.itemId));
  const sales: Sale[] = [];
  for (const sale of incoming.sales) {
    const winner = won(sale.itemId);
    if (haveSale.has(sale.itemId) ? winner === "incoming" : winner !== "existing") {
      sales.push(sale);
      counts.salesWritten++;
    }
  }

  const havePose = new Set(existing.poses.map((p) => p.id));
  const poses = incoming.poses.filter((p) => !havePose.has(p.id));
  counts.posesAdded = poses.length;
  return { write: { items, sales, poses }, counts };
}

export async function localRows(): Promise<Rows> {
  const [items, sales, poses] = await Promise.all([listItems(), listSales(), listPoses()]);
  return { items, sales, poses };
}

export function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const key of BACKUP_SETTING_KEYS) {
      const v = localStorage.getItem(key);
      if (v !== null) out[key] = v;
    }
  } catch {
    // blocked storage: the backup simply carries no settings
  }
  return out;
}

export async function restoreBackup(p: ParsedBackup, mode: "merge" | "replace") {
  const incoming: Rows = { items: p.items.map(stripLegacyPhotoFields), sales: p.sales, poses: p.poses };
  if (mode === "replace") {
    await replaceAll(incoming);
    try {
      for (const [key, value] of Object.entries(pickSettings(p.settings))) localStorage.setItem(key, value);
    } catch {
      // blocked storage: the data is restored, the settings keep their defaults
    }
  } else {
    await putAllRaw(planMerge(await localRows(), incoming).write);
  }
}

export function lastBackupAt(): number | undefined {
  try {
    const n = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function markBackedUp() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // blocked storage: the reminder simply keeps showing
  }
}

export type SaveResult = "saved" | "cancelled";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// On a phone the share sheet puts the file in Files, iCloud or a message; on a computer it downloads.
export async function saveBackup(): Promise<SaveResult> {
  const blob = await buildBackupBlob(await localRows(), readSettings());
  const name = `vinted-assistant-${new Date().toLocaleDateString("sv-SE")}.zip`;
  const file = new File([blob], name, { type: "application/zip" });
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  let shared = false;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      shared = true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // iOS refuses share() once the tap's moment has passed while the file was built: download instead
    }
  }
  if (!shared) download(blob, name);
  markBackedUp();
  void navigator.storage?.persist?.();
  return "saved";
}

// Replace clears the stores first, so refuse when the file could not fit back.
export async function hasRoomFor(bytes: number): Promise<boolean> {
  const estimate = await navigator.storage?.estimate?.();
  return !estimate?.quota || bytes < estimate.quota * 0.8;
}

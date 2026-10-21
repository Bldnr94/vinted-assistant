import { describe, expect, it } from "vitest";
import { BackupError, buildBackupBlob, buildEntries, parseBackup, planMerge, validateManifest } from "./backup";
import type { Item, ModelPose, Photo, Rows, Sale } from "./db";
import { openZip, zipBlobs } from "./zip";

const jpeg = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

function photo(id: string, extra: Partial<Photo> = {}): Photo {
  return { id, kind: "front", blob: jpeg([1, 2, 3]), addedAt: 10, ...extra };
}
function item(id: string, extra: Partial<Item> = {}): Item {
  return { id, createdAt: 1, updatedAt: 100, status: "draft", notes: "", photos: [], ...extra };
}
function sale(itemId: string, soldPrice = 10): Sale {
  return {
    itemId, title: "Robe", brand: "Zara", category_path: "Femmes > Robes", size: "M", condition: "Très bon état",
    firstPrice: 12, listedPrice: 12, soldPrice, listedAt: 1, soldAt: 2,
  };
}
const pose = (id: string): ModelPose => ({ id, blob: jpeg([9, 9]), createdAt: 5 });
const rows = (r: Partial<Rows> = {}): Rows => ({ items: [], sales: [], poses: [], ...r });

describe("backup file", () => {
  it("round-trips items, every photo variant, sales and model photos", async () => {
    const original = rows({
      items: [
        item("a", {
          status: "sold",
          soldPrice: 10,
          photos: [photo("p1", { fixed: jpeg([4]), improved: jpeg([5, 6]), useFixed: true, useImproved: false }), photo("p2", { kind: "ai_model", include: false })],
        }),
      ],
      sales: [sale("a")],
      poses: [pose("m1")],
    });
    const parsed = await parseBackup(await buildBackupBlob(original, { "reply-settings": '{"tutoie":true}' }, 1234));

    expect(parsed.exportedAt).toBe(1234);
    expect(parsed.sales).toEqual(original.sales);
    expect(parsed.settings).toEqual({ "reply-settings": '{"tutoie":true}' });
    const [back] = parsed.items;
    expect(back).toMatchObject({ id: "a", status: "sold", soldPrice: 10, updatedAt: 100 });
    expect(back.photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(await bytesOf(back.photos[0].blob)).toEqual([1, 2, 3]);
    expect(await bytesOf(back.photos[0].fixed!)).toEqual([4]);
    expect(await bytesOf(back.photos[0].improved!)).toEqual([5, 6]);
    expect(back.photos[0]).toMatchObject({ useFixed: true, useImproved: false });
    expect(back.photos[1]).toMatchObject({ kind: "ai_model", include: false });
    expect(back.photos[1].fixed).toBeUndefined();
    expect(parsed.poses[0].id).toBe("m1");
    expect(await bytesOf(parsed.poses[0].blob)).toEqual([9, 9]);
    expect(back.photos[0].blob.type).toBe("image/jpeg");
  });

  it("never writes the app token, even if it is handed over with the settings", async () => {
    const entries = buildEntries(rows(), { "app-token": "SECRET-VALUE", "price-drop-settings": "{}" });
    const manifest = await entries[0].data.text();
    expect(manifest).not.toContain("SECRET-VALUE");
    expect(manifest).not.toContain("app-token");
    expect(JSON.parse(manifest).settings).toEqual({ "price-drop-settings": "{}" });
  });

  it("carries the business profile with the other settings", () => {
    const profile = '{"sellsAsBusiness":true,"siret":"12345678200010"}';
    const entries = buildEntries(rows(), { "business-profile": profile, "unknown-key": "x" });
    return entries[0].data.text().then((t) => expect(JSON.parse(t).settings).toEqual({ "business-profile": profile }));
  });

  it("ignores a token smuggled into a backup's settings on import", async () => {
    const manifest = JSON.stringify({
      app: "vinted-assistant", schemaVersion: 3, exportedAt: 1, items: [], sales: [], poses: [],
      settings: { "app-token": "EVIL", "inventory-filter": "live" },
    });
    const file = await zipBlobs([{ name: "manifest.json", data: new Blob([manifest]) }]);
    expect((await parseBackup(file)).settings).toEqual({ "inventory-filter": "live" });
  });

  it("drops legacy photo fields from old records", async () => {
    const legacy = { ...photo("p1"), cutout: jpeg([7]), colourShift: 3, improvedBy: "fal" } as Photo;
    const parsed = await parseBackup(await buildBackupBlob(rows({ items: [item("a", { photos: [legacy] })] }), {}));
    expect(Object.keys(parsed.items[0].photos[0])).not.toContain("cutout");
    expect(Object.keys(parsed.items[0].photos[0])).not.toContain("improvedBy");
  });

  it("skips a photo record that has lost its image", async () => {
    const broken = { id: "x", kind: "front", addedAt: 1 } as unknown as Photo;
    const parsed = await parseBackup(await buildBackupBlob(rows({ items: [item("a", { photos: [broken, photo("ok")] })] }), {}));
    expect(parsed.items[0].photos.map((p) => p.id)).toEqual(["ok"]);
  });
});

describe("rejecting bad files", () => {
  const manifestWith = (patch: Record<string, unknown>) => ({
    app: "vinted-assistant", schemaVersion: 3, exportedAt: 1, items: [], sales: [], poses: [], settings: {}, ...patch,
  });
  const check = (m: unknown, has = () => true) => () => validateManifest(m, has);

  it("rejects other apps' files and newer versions", () => {
    expect(check({ app: "other" })).toThrow(BackupError);
    expect(check(manifestWith({ schemaVersion: 99 }))).toThrow(/newer version/);
    expect(check(null)).toThrow(BackupError);
  });

  it("rejects items with a bad status or price", () => {
    const it = { id: "a", createdAt: 1, updatedAt: 1, status: "weird", photos: [] };
    expect(check(manifestWith({ items: [it] }))).toThrow(/an item/);
    expect(check(manifestWith({ items: [{ ...it, status: "live", listedPrice: "12" }] }))).toThrow(/price/);
  });

  it("rejects a photo whose file is not in the archive", () => {
    const p = { id: "p", kind: "front", addedAt: 1, blob: { path: "photos/a/p/blob.jpg", type: "image/jpeg" } };
    const it = { id: "a", createdAt: 1, updatedAt: 1, status: "draft", photos: [p] };
    expect(check(manifestWith({ items: [it] }), () => false)).toThrow(/missing a photo file|missing/);
    expect(check(manifestWith({ items: [it] }), () => true)).not.toThrow();
  });

  it("rejects a sale without a numeric price", () => {
    expect(check(manifestWith({ sales: [{ itemId: "a", soldPrice: "9", soldAt: 1 }] }))).toThrow(/a sale/);
  });

  it("rejects a zip without a manifest and a non-zip", async () => {
    await expect(parseBackup(await zipBlobs([{ name: "other.txt", data: new Blob(["x"]) }]))).rejects.toThrow(BackupError);
    await expect(parseBackup(new Blob(["nope"]))).rejects.toThrow();
  });

  it("keeps the photos in the archive under readable paths", async () => {
    const zip = await openZip(await zipBlobs(buildEntries(rows({ items: [item("a", { photos: [photo("p1")] })] }), {})));
    expect(zip.names).toContain("photos/a/p1/blob.jpg");
  });
});

describe("planMerge", () => {
  it("adds missing items, replaces older ones and keeps newer local ones", () => {
    const existing = rows({ items: [item("old", { updatedAt: 50 }), item("newer", { updatedAt: 500 })] });
    const incoming = rows({ items: [item("fresh"), item("old", { updatedAt: 60 }), item("newer", { updatedAt: 400 })] });
    const { write, counts } = planMerge(existing, incoming);
    expect(write.items.map((i) => i.id).sort()).toEqual(["fresh", "old"]);
    expect(counts).toMatchObject({ itemsAdded: 1, itemsUpdated: 1, itemsKept: 1 });
  });

  it("does not turn a live local item back into a sold one", () => {
    const existing = rows({ items: [item("a", { status: "live", updatedAt: 500 })] });
    const incoming = rows({ items: [item("a", { status: "sold", updatedAt: 400 })], sales: [sale("a")] });
    expect(planMerge(existing, incoming).write.sales).toEqual([]);
  });

  it("takes the sale of an item that was updated in the backup", () => {
    const existing = rows({ items: [item("a", { updatedAt: 100 })], sales: [sale("a", 5)] });
    const incoming = rows({ items: [item("a", { status: "sold", updatedAt: 200 })], sales: [sale("a", 9)] });
    expect(planMerge(existing, incoming).write.sales[0].soldPrice).toBe(9);
  });

  it("keeps the local sale when the local item is newer", () => {
    const existing = rows({ items: [item("a", { updatedAt: 300 })], sales: [sale("a", 5)] });
    const incoming = rows({ items: [item("a", { updatedAt: 200 })], sales: [sale("a", 9)] });
    expect(planMerge(existing, incoming).write.sales).toEqual([]);
  });

  it("restores a sale whose item no longer exists anywhere", () => {
    expect(planMerge(rows(), rows({ sales: [sale("gone")] })).write.sales).toHaveLength(1);
  });

  it("adds only the model photos that are missing", () => {
    const { write, counts } = planMerge(rows({ poses: [pose("m1")] }), rows({ poses: [pose("m1"), pose("m2")] }));
    expect(write.poses.map((p) => p.id)).toEqual(["m2"]);
    expect(counts.posesAdded).toBe(1);
  });

  it("is idempotent: merging the same backup twice writes nothing new", () => {
    const data = rows({ items: [item("a")], sales: [sale("a")], poses: [pose("m1")] });
    const plan = planMerge(data, data);
    expect(plan.write.items).toEqual([]);
    expect(plan.write.poses).toEqual([]);
  });
});

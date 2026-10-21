import { describe, expect, it } from "vitest";
import { stripLegacyPhotoFields, type Item, type Photo } from "./db";

const blob = new Blob(["x"], { type: "image/jpeg" });
const item = (photos: unknown[]): Item => ({ id: "a", createdAt: 1, updatedAt: 2, status: "draft", notes: "", photos: photos as Photo[] });

describe("stripLegacyPhotoFields", () => {
  it("removes the fields of the removed cut-out and colour-shift features", () => {
    const old = item([{ id: "p", kind: "front", blob, addedAt: 1, cutout: blob, colourShift: 4, improvedBy: "fal", improved: blob }]);
    const [photo] = stripLegacyPhotoFields(old).photos;
    expect(Object.keys(photo).sort()).toEqual(["addedAt", "blob", "id", "improved", "kind"]);
  });

  it("returns the very same object when there is nothing to remove", () => {
    const clean = item([{ id: "p", kind: "front", blob, addedAt: 1 }]);
    expect(stripLegacyPhotoFields(clean)).toBe(clean);
  });

  it("does not change the original and keeps the rest of the item", () => {
    const old = item([{ id: "p", kind: "front", blob, addedAt: 1, cutout: blob }]);
    const out = stripLegacyPhotoFields(old);
    expect("cutout" in old.photos[0]).toBe(true);
    expect(out).toMatchObject({ id: "a", updatedAt: 2, status: "draft" });
  });
});

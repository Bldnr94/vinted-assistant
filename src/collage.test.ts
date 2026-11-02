import { describe, expect, it } from "vitest";
import { collageHasAi, pickTiles } from "./collage";
import type { Photo } from "./db";
import { hasAiImages, orderedPhotos, realPhotos } from "./photos";

let t = 0;
const photo = (kind: Photo["kind"], extra: Partial<Photo> = {}): Photo => ({
  id: `${kind}-${t}`,
  kind,
  blob: new Blob([kind + t++]),
  addedAt: t,
  ...extra,
});

describe("pickTiles", () => {
  const front = photo("front");
  const back = photo("back");
  const label = photo("brand_label");
  const defect = photo("defect");
  const detail1 = photo("detail");
  const detail2 = photo("detail");
  const worn = photo("ai_model", { include: true });
  const unapproved = photo("ai_model", { include: false });

  it("puts the real front, then both model photos (front then back worn) on top", () => {
    const wornBack = photo("ai_model", { include: true });
    const tiles = pickTiles([detail1, worn, back, front, label, wornBack], true);
    expect(tiles.top.map((x) => x.blob)).toEqual([front.blob, worn.blob, wornBack.blob]);
    expect(tiles.top.map((x) => x.ai)).toEqual([false, true, true]);
    expect(tiles.bottom.map((x) => x.blob)).toContain(back.blob);
    expect(collageHasAi(tiles)).toBe(true);
  });

  it("uses model photos even when they aren't ticked for the listing on their own", () => {
    const tiles = pickTiles([front, back, unapproved], true);
    expect(tiles.top.map((x) => x.blob)).toEqual([front.blob, unapproved.blob]);
  });

  it("uses the back instead when model photos are left out", () => {
    const tiles = pickTiles([front, back, worn], false);
    expect(tiles.top.map((x) => x.blob)).toEqual([front.blob, back.blob]);
    expect(collageHasAi(tiles)).toBe(false);
  });

  it("keeps the label and a defect in the small tiles before a second detail", () => {
    const tiles = pickTiles([front, back, detail1, detail2, defect, label], false);
    expect(tiles.bottom.map((x) => x.blob)).toEqual([label.blob, defect.blob, detail1.blob, detail2.blob]);
  });
});

describe("collage placement", () => {
  const front = photo("front");
  const back = photo("back");
  it("puts a real-photo collage first and an AI collage right after the front photo", () => {
    expect(orderedPhotos([back, front, photo("collage")]).map((p) => p.kind)).toEqual(["collage", "front", "back"]);
    expect(orderedPhotos([back, front, photo("collage_ai")]).map((p) => p.kind)).toEqual(["front", "collage_ai", "back"]);
  });

  it("counts an approved AI collage for the AI notice and never as a real photo", () => {
    const ai = photo("collage_ai", { include: true });
    expect(hasAiImages([front, ai])).toBe(true);
    expect(hasAiImages([front, photo("collage", { include: true })])).toBe(false);
    expect(realPhotos([front, ai]).map((p) => p.kind)).toEqual(["front"]);
  });
});

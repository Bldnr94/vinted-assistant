// One image that shows the item at a glance, like many Vinted sellers' first photo: the item
// itself and worn on top, labels, details and defects underneath. Made on the phone from photos
// you already have, nothing is redrawn: each tile is the photo cropped to fit. No tag is drawn on
// AI tiles (Victor's call, 2026-11-02): the description's AI notice covers them.
import type { ShotKind } from "../shared/listing";
import type { Photo } from "./db";
import { listingPhotos } from "./photos";

export interface Tile {
  blob: Blob;
  ai: boolean;
}

const TOP = 2; // big tiles: the item, then worn
const BOTTOM = 3; // small tiles: labels, defects, details
const BOTTOM_ORDER: ShotKind[] = ["brand_label", "defect", "detail", "size_tag", "back", "care_label"];

// Uses the photos as they will go on the listing (improved where you chose it), and only the
// AI photos you approved. Without them, the second big tile is the back.
export function pickTiles(photos: Photo[], withAi: boolean): { top: Tile[]; bottom: Tile[] } {
  const listed = listingPhotos(photos).filter(({ photo }) => photo.kind !== "collage" && photo.kind !== "collage_ai");
  const real = (kind: ShotKind) => listed.filter(({ photo }) => photo.kind === kind);
  const used = new Set<string>();
  const take = (entry: { photo: Photo; blob: Blob } | undefined, ai = false): Tile[] => {
    if (!entry || used.has(entry.photo.id)) return [];
    used.add(entry.photo.id);
    return [{ blob: entry.blob, ai }];
  };

  const worn = withAi ? listed.filter(({ photo }) => photo.kind === "ai_model") : [];
  const top = [...take(real("front")[0]), ...(worn.length ? take(worn[0], true) : take(real("back")[0]))].slice(0, TOP);

  const bottom: Tile[] = [];
  // One of each kind first, so three detail shots don't push out the label or a defect.
  for (const pass of [0, 1]) {
    for (const kind of BOTTOM_ORDER) {
      if (bottom.length >= BOTTOM) break;
      bottom.push(...take(real(kind)[pass]));
    }
  }
  return { top, bottom: bottom.slice(0, BOTTOM) };
}

export const collageHasAi = (tiles: { top: Tile[]; bottom: Tile[] }) => [...tiles.top, ...tiles.bottom].some((t) => t.ai);

// Portrait 3:4 like a phone photo, so Vinted shows it whole.
const W = 1200;
const H = 1600;
const GAP = 10;
const MAX_CROP = 0.2; // share of a photo's width or height a tile may cut off

async function drawTile(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, w: number, h: number) {
  const bitmap = await createImageBitmap(tile.blob);
  const cover = Math.max(w / bitmap.width, h / bitmap.height);
  const fit = Math.min(w / bitmap.width, h / bitmap.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Fill the tile, nudged up a little since garments and labels sit high in the frame...
  const fill = (scale: number) => {
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) * 0.4, dw, dh);
  };
  if (fit / cover >= 1 - MAX_CROP) {
    fill(cover);
  } else {
    // ...unless that would cut off more than MAX_CROP (a sleeve, a label's text): then the whole
    // photo goes over a blurred, enlarged copy of itself.
    ctx.filter = "blur(24px) brightness(0.9)";
    fill(cover * 1.1);
    ctx.filter = "none";
    fill(fit);
  }
  ctx.restore();
  bitmap.close();
}

async function drawRow(ctx: CanvasRenderingContext2D, tiles: Tile[], y: number, h: number) {
  const w = (W - GAP * (tiles.length + 1)) / tiles.length;
  for (const [i, tile] of tiles.entries()) await drawTile(ctx, tile, GAP + i * (w + GAP), y, w, h);
}

export async function renderCollage({ top, bottom }: { top: Tile[]; bottom: Tile[] }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  if (bottom.length && top.length) {
    const topH = Math.round((H - GAP * 3) * 0.6);
    await drawRow(ctx, top, GAP, topH);
    await drawRow(ctx, bottom, GAP * 2 + topH, H - GAP * 3 - topH);
  } else {
    await drawRow(ctx, top.length ? top : bottom, GAP, H - GAP * 2);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the collage"))), "image/jpeg", 0.9),
  );
}

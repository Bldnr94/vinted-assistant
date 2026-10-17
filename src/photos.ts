// Photo handling on the phone. Real photos are resized and, on request, placed on a
// studio background; the garment's own pixels are copied unchanged so defects and
// colours stay exactly as shot.
import { AI_NOTICE, SHOT_ORDER, type DraftImage, type ShotKind } from "../shared/listing";
import type { Photo } from "./db";

const MAX_SIDE = 1600;

// Only whole-garment shots get a studio background; labels and defects stay as shot.
export const IMPROVABLE: ShotKind[] = ["front", "back", "detail"];

export async function resizeToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", 0.9),
  );
}

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function dataUriToBlob(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

const rank = (p: Photo) => (p.kind === "ai_model" ? SHOT_ORDER.length : SHOT_ORDER.indexOf(p.kind));

// Listing order: front, back, labels, defects, details, then approved AI images last.
export function orderedPhotos(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => rank(a) - rank(b) || a.addedAt - b.addedAt);
}

export const realPhotos = (photos: Photo[]) => photos.filter((p) => p.kind !== "ai_model");

// The photo before any studio background: auto-fixed if you kept the fix, else as shot.
export const basePhoto = (p: Photo): Blob => (p.useFixed && p.fixed ? p.fixed : p.blob);

// What goes on the listing: real photos (improved where chosen), then approved AI images.
export function listingPhotos(photos: Photo[]): { photo: Photo; blob: Blob }[] {
  return orderedPhotos(photos)
    .filter((p) => p.kind !== "ai_model" || p.include)
    .map((p) => ({ photo: p, blob: p.useImproved && p.improved ? p.improved : basePhoto(p) }));
}

export const hasAiImages = (photos: Photo[]) => photos.some((p) => p.kind === "ai_model" && p.include);

// The description as it goes on Vinted: ends with the AI notice whenever AI images are included.
export const listingDescription = (description: string, photos: Photo[]) =>
  hasAiImages(photos) && !description.includes(AI_NOTICE) ? `${description.trimEnd()}\n\n${AI_NOTICE}` : description;

export async function toDraftImages(photos: Photo[]): Promise<DraftImage[]> {
  // Labels and defects matter most to the draft, so they go first if we hit the cap.
  const priority: ShotKind[] = ["brand_label", "size_tag", "care_label", "front", "defect", "back", "detail"];
  const real = photos.filter((p): p is Photo & { kind: ShotKind } => p.kind !== "ai_model");
  const sorted = real.sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind));
  return Promise.all(
    sorted.map(async (p) => ({ kind: p.kind, media_type: "image/jpeg" as const, data: await toBase64(basePhoto(p)) })),
  );
}

export function photoFiles(photos: Photo[], baseName: string): File[] {
  return listingPhotos(photos).map(
    ({ blob }, i) => new File([blob], `${baseName}-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }),
  );
}

// Puts a cutout (transparent PNG from /api/enhance) on a light studio background with
// a soft shadow, cropped around the garment at 3:4. Returns the JPEG and how much the
// garment's colours differ from the original photo (should be close to 0).
export async function composeStudio(original: Blob, cutout: Blob): Promise<{ jpeg: Blob; colourShift: number }> {
  const [orig, cut] = await Promise.all([createImageBitmap(original), createImageBitmap(cutout)]);
  const w = orig.width;
  const h = orig.height;

  const read = (img: ImageBitmap) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };
  const o = read(orig);
  const m = read(cut);

  // Garment bounding box from the cutout's alpha, and colour difference on solid pixels.
  let x0 = w, y0 = h, x1 = 0, y1 = 0, diff = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = m[i + 3];
      if (a > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (a > 240) {
        diff += Math.abs(m[i] - o[i]) + Math.abs(m[i + 1] - o[i + 1]) + Math.abs(m[i + 2] - o[i + 2]);
        n += 3;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error("No garment found in this photo.");

  // Crop: garment plus a 10% margin, widened to a 3:4 frame.
  const gw = x1 - x0, gh = y1 - y0;
  let cw = gw * 1.2, ch = gh * 1.2;
  if (cw / ch > 3 / 4) ch = (cw * 4) / 3;
  else cw = (ch * 3) / 4;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const scale = Math.min(1, MAX_SIDE / ch);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#f6f6f4");
  bg.addColorStop(1, "#e8e8e5");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
  ctx.shadowBlur = 28 * scale;
  ctx.shadowOffsetY = 10 * scale;
  ctx.drawImage(cut, -(cx - cw / 2) * scale, -(cy - ch / 2) * scale, w * scale, h * scale);
  ctx.restore();
  orig.close();
  cut.close();

  return { jpeg: await canvasToJpeg(canvas), colourShift: n ? diff / n : 0 };
}

// Caps that keep the automatic fix a correction, never a different-looking garment.
const MAX_WHITE_GAIN = 1.25; // brightens whites by at most 25%
const DIM_HIGHLIGHTS = 200; // a photo whose brightest 0.5% stays below this was shot in dim light
const MAX_BRIGHTEN_GAMMA = 0.7; // strongest midtone lift for a dim photo
const MAX_WB_GAIN = 0.1; // white balance moves any channel by at most 10%
const MIN_NEUTRAL_SHARE = 0.04; // white balance only when enough of the photo is grey or white
const MIN_VISIBLE_CHANGE = 3; // average 0-255 change below which the photo is left alone

// Automatic exposure and colour-cast correction for whole-garment shots.
// Every pixel goes through the same per-channel curve, so nothing is redrawn, added or
// removed: stains and wear stay, they just get the same lighting as the rest. White
// balance is measured only on near-neutral pixels (wall, floor, hanger) and capped, so a
// red jumper can't be "corrected" towards grey. Returns null when the photo is already fine.
export async function autoFix(photo: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;

  // Measure on every 4th pixel: luminance histogram and the average colour of neutral pixels.
  const hist = new Uint32Array(256);
  let n = 0, neutral = 0, nr = 0, ng = 0, nb = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    hist[y]++;
    n++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (y > 50 && y < 245 && max - min < 0.15 * max) {
      neutral++;
      nr += r;
      ng += g;
      nb += b;
    }
  }
  const percentile = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= p * n) return v;
    return 255;
  };

  // White balance: scale channels so neutral areas average out grey, within the cap.
  let gains = [1, 1, 1];
  if (neutral / n >= MIN_NEUTRAL_SHARE) {
    const avg = (nr + ng + nb) / 3;
    const clamp = (x: number) => Math.min(1 + MAX_WB_GAIN, Math.max(1 - MAX_WB_GAIN, x));
    gains = [clamp(avg / nr), clamp(avg / ng), clamp(avg / nb)];
  }

  // Levels: bring the brightest 0.5% up to white, within the cap. Blacks never move, so
  // navy and black garments keep their depth.
  const lo = 0;
  const highlights = percentile(0.995);
  const hi = Math.max(highlights, 255 / MAX_WHITE_GAIN);

  // Exposure: lift the midtones only when even the highlights are dim. Judging by the
  // highlights, not the average, keeps a deep red or black garment that fills the frame
  // from being brightened into a lighter colour.
  const median = (percentile(0.5) - lo) / (hi - lo);
  let gamma = 1;
  if (highlights < DIM_HIGHLIGHTS && median > 0.02 && median < 0.4) {
    gamma = Math.max(MAX_BRIGHTEN_GAMMA, Math.log(0.45) / Math.log(median));
  }

  const curve = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    curve[v] = Math.round(255 * Math.pow(t, gamma));
  }
  const luts = gains.map((g) => {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = curve[Math.min(255, Math.round(v * g))];
    return lut;
  });

  // Skip the fix when it would barely show (estimated on the luminance histogram).
  let change = 0;
  for (let v = 0; v < 256; v++) {
    change += hist[v] * (Math.abs(luts[0][v] - v) + Math.abs(luts[1][v] - v) + Math.abs(luts[2][v] - v)) / 3;
  }
  if (change / n < MIN_VISIBLE_CHANGE) return null;

  for (let i = 0; i < d.length; i += 4) {
    d[i] = luts[0][d[i]];
    d[i + 1] = luts[1][d[i + 1]];
    d[i + 2] = luts[2][d[i + 2]];
  }
  ctx.putImageData(image, 0, 0);
  return canvasToJpeg(canvas);
}

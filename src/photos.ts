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

// What goes on the listing: real photos (improved where chosen), then approved AI images.
export function listingPhotos(photos: Photo[]): { photo: Photo; blob: Blob }[] {
  return orderedPhotos(photos)
    .filter((p) => p.kind !== "ai_model" || p.include)
    .map((p) => ({ photo: p, blob: p.useImproved && p.improved ? p.improved : p.blob }));
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
    sorted.map(async (p) => ({ kind: p.kind, media_type: "image/jpeg" as const, data: await toBase64(p.blob) })),
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

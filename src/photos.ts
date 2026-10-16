// Photos are only resized here: no filters, no background changes.
// Cleanup comes in Phase 2 and must never hide defects or shift colours.
import { SHOT_ORDER, type DraftImage } from "../shared/listing";
import type { Photo } from "./db";

const MAX_SIDE = 1600;

export async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", 0.88),
  );
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Listing order: front, back, labels, then defects, then details.
export function orderedPhotos(photos: Photo[]): Photo[] {
  return [...photos].sort(
    (a, b) => SHOT_ORDER.indexOf(a.kind) - SHOT_ORDER.indexOf(b.kind) || a.addedAt - b.addedAt,
  );
}

export async function toDraftImages(photos: Photo[]): Promise<DraftImage[]> {
  // Labels and defects matter most to the draft, so they go first if we hit the cap.
  const priority = ["brand_label", "size_tag", "care_label", "front", "defect", "back", "detail"];
  const sorted = [...photos].sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind));
  return Promise.all(
    sorted.map(async (p) => ({ kind: p.kind, media_type: "image/jpeg" as const, data: await toBase64(p.blob) })),
  );
}

export function photoFiles(photos: Photo[], baseName: string): File[] {
  return orderedPhotos(photos).map(
    (p, i) => new File([p.blob], `${baseName}-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }),
  );
}

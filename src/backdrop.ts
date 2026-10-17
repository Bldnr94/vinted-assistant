// Backgrounds the garment is laid on in the Studio step. The built-in ones are generated
// images in public/backdrops/; "own" is one photo of an empty spot you like at home,
// kept on this phone. "plain" is the light-grey studio gradient.

export type BackdropId = "wood" | "linen" | "wall" | "own" | "plain";

export const BACKDROPS: { id: BackdropId; label: string }[] = [
  { id: "wood", label: "Wood floor" },
  { id: "linen", label: "White sheet" },
  { id: "wall", label: "Light wall" },
  { id: "own", label: "Your own" },
  { id: "plain", label: "Plain studio" },
];

const CHOICE_KEY = "studio-backdrop";
const OWN_KEY = "studio-backdrop-own";
const OWN_W = 1200;
const OWN_H = 1600;

export function readBackdrop(): BackdropId {
  try {
    const id = localStorage.getItem(CHOICE_KEY) as BackdropId | null;
    return BACKDROPS.some((b) => b.id === id) ? id! : "wood";
  } catch {
    return "wood";
  }
}

export function saveBackdrop(id: BackdropId) {
  try {
    localStorage.setItem(CHOICE_KEY, id);
  } catch {
    // Falls back to the wood floor next time.
  }
}

export function hasOwnBackdrop(): boolean {
  try {
    return !!localStorage.getItem(OWN_KEY);
  } catch {
    return false;
  }
}

// Stores your backdrop photo, cropped to the 3:4 listing frame (about 200 KB as JPEG).
export async function saveOwnBackdrop(file: Blob): Promise<void> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = OWN_W;
  canvas.height = OWN_H;
  drawCover(canvas.getContext("2d")!, bitmap, OWN_W, OWN_H);
  bitmap.close();
  try {
    localStorage.setItem(OWN_KEY, canvas.toDataURL("image/jpeg", 0.82));
  } catch {
    throw new Error("This browser blocked local storage, so the backdrop could not be saved.");
  }
}

// The backdrop image, or null for the plain studio gradient.
export async function backdropImage(id: BackdropId): Promise<Blob | null> {
  if (id === "plain") return null;
  const url = id === "own" ? localStorage.getItem(OWN_KEY) : `/backdrops/${id}.jpg`;
  if (!url) throw new Error("Take a photo of your backdrop first.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the ${id} background.`);
  return res.blob();
}

// Scales an image to fill w × h, cropping the overflow evenly.
export function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

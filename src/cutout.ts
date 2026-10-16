// Cuts the garment out of a photo, returning a transparent PNG for composeStudio().
// "phone" runs IS-Net in the browser (free, the photo never leaves the phone; the ~88 MB
// model downloads once from /cutout/). "fal" sends it to Bria RMBG 2.0 on fal.ai (cleaner
// edges, about 0.018 USD a photo, needs FAL_KEY).
import { toBase64 } from "./photos";

export type CutoutEngine = "phone" | "fal";

const ENGINE_KEY = "cutout-engine";

export function readEngine(): CutoutEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === "fal" ? "fal" : "phone";
  } catch {
    return "phone";
  }
}

export function saveEngine(engine: CutoutEngine) {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    // Falls back to the free engine next time.
  }
}

export async function cutout(
  photo: Blob,
  engine: CutoutEngine,
  token: string,
  onProgress: (message: string) => void,
): Promise<Blob> {
  return engine === "fal" ? cutoutOnFal(photo, token) : cutoutOnPhone(photo, onProgress);
}

async function cutoutOnPhone(photo: Blob, onProgress: (message: string) => void): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(photo, {
    publicPath: new URL("/cutout/", location.origin).href,
    model: "isnet_fp16",
    device: "gpu", // WebGPU when the phone has it, otherwise WebAssembly
    output: { format: "image/png" },
    progress: (key, current, total) => {
      if (key.startsWith("fetch:/models/") && total > 0) {
        onProgress(
          current < total
            ? `Downloading the cutout model, once: ${Math.round((current / total) * 100)}%`
            : "Cutting out the garment…",
        );
      }
    },
  });
}

async function cutoutOnFal(photo: Blob, token: string): Promise<Blob> {
  const res = await fetch("/api/enhance", {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-token": token },
    body: JSON.stringify({ image: await toBase64(photo) }),
  });
  const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
  if (!res.ok) throw new Error(body.error || `Server answered ${res.status}`);
  return (await fetch(body.cutout)).blob();
}

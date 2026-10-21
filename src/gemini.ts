// Lets the Mac Chrome extension (extension/bridge-content.js) tell the app to refresh after
// it writes an automated "On model" photo straight into IndexedDB. A content script runs in
// an isolated JS world: it can read and write the same IndexedDB and localStorage as this
// page, but it has no access to this module's in-memory listeners, so the only channel back
// into React is a window CustomEvent ("va:gemini-automate" out, "va:gemini-status" back in).
import { useEffect, useState } from "react";

const listeners = new Set<() => void>();

window.addEventListener("va:gemini-status", (e) => {
  const detail = (e as CustomEvent<{ status: string }>).detail;
  if (detail?.status === "done") listeners.forEach((fn) => fn());
});

// Re-renders the caller once the extension finishes writing a new AI photo for this item.
export function useGeminiVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  return v;
}

// One Gemini job for the Chrome extension. "enhance": redraw the background of ONE photo of
// the item; the result is stored on that photo (Photo.improved, unticked). "tryon": put the
// garment photo on a saved model pose; the result is added to the item as an unapproved AI
// photo. Resolves when the result is saved, rejects with a readable message if the extension is
// missing or Gemini fails. Jobs must run one at a time.
export type GeminiJob =
  | { mode: "enhance"; itemId: string; photoId: string; prompt: string }
  | { mode: "tryon"; itemId: string; photoId: string; poseId: string; prompt: string };

export function runGeminiJob(job: GeminiJob): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => {
      window.removeEventListener("va:gemini-status", onStatus);
      clearTimeout(noAnswer);
      clearTimeout(tooLong);
    };
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ status: string; error?: string }>).detail;
      if (detail?.status === "started") started = true;
      else if (detail?.status === "done") {
        cleanup();
        resolve();
      } else if (detail?.status === "failed") {
        cleanup();
        reject(new Error(detail.error || "Gemini automation failed."));
      }
    };
    const noAnswer = setTimeout(() => {
      if (started) return;
      cleanup();
      reject(new Error("The Chrome extension did not answer. Is it installed, and was this tab reloaded after loading it?"));
    }, 8000);
    const tooLong = setTimeout(() => {
      cleanup();
      reject(new Error("Gemini took too long. Check the Gemini tab."));
    }, 6 * 60 * 1000);
    window.addEventListener("va:gemini-status", onStatus);
    window.dispatchEvent(
      new CustomEvent("va:gemini-automate", {
        detail: { mode: job.mode, itemId: job.itemId, garmentPhotoId: job.photoId, poseId: job.mode === "tryon" ? job.poseId : undefined, prompt: job.prompt },
      }),
    );
  });
}

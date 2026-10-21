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

// Asks the extension (if installed) to run the garment + pose + prompt through Gemini and
// bring the result back as a new AI photo on this item. No-op if the extension isn't
// installed or its content script hasn't loaded on this page.
export function requestGeminiAutomation(itemId: string, garmentPhotoId: string, poseId: string, prompt: string) {
  window.dispatchEvent(new CustomEvent("va:gemini-automate", { detail: { itemId, garmentPhotoId, poseId, prompt } }));
}

// Asks the extension to send ONE photo of the item through Gemini with `prompt` and store the
// result on that photo (Photo.improved, improvedBy "gemini"). Resolves when it is saved,
// rejects with a readable message if the extension is missing or Gemini fails.
export function requestGeminiEnhance(itemId: string, photoId: string, prompt: string): Promise<void> {
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
    window.dispatchEvent(new CustomEvent("va:gemini-automate", { detail: { mode: "enhance", itemId, garmentPhotoId: photoId, prompt } }));
  });
}

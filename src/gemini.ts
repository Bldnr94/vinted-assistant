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

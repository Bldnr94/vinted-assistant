// Batch mode: items you queue are drafted in the background, one Claude call at a
// time, while you keep photographing. The queue lives on the items themselves
// (draftState), so a reload or a killed tab picks up where it stopped.
import { useEffect, useState } from "react";
import { MAX_PHOTOS_TO_CLAUDE, type DraftResponse } from "../shared/listing";
import { postJson, errorText } from "./api";
import { getItem, listItems, saveItem, type Item } from "./db";
import { toDraftImages } from "./photos";

export async function requestDraft(item: Item): Promise<DraftResponse> {
  const images = (await toDraftImages(item.photos)).slice(0, MAX_PHOTOS_TO_CLAUDE);
  return postJson<DraftResponse>("/api/draft", { images, notes: item.notes });
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
let running = false;
let paused = false;

// Used while a backup is restored: no new draft starts, and the one in flight finishes first.
export async function pauseQueue() {
  paused = true;
  while (running) await new Promise((r) => setTimeout(r, 200));
}

export function unpauseQueue() {
  paused = false;
  void runQueue();
}

// Re-reads the item before every write so photos or notes added meanwhile are kept.
async function patch(id: string, fn: (cur: Item) => Item) {
  const cur = await getItem(id);
  if (cur) await saveItem(fn(cur));
  notify();
}

export async function enqueue(id: string) {
  await patch(id, (cur) => ({ ...cur, draftState: "queued", draftError: undefined }));
  void runQueue();
}

async function runQueue() {
  if (running || paused) return;
  running = true;
  try {
    for (;;) {
      const next = (await listItems())
        .filter((i) => i.draftState === "queued" && i.photos.length > 0)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!next || paused) break;
      await patch(next.id, (cur) => ({ ...cur, draftState: "drafting" }));
      try {
        const { draft, model, usage } = await requestDraft(next);
        await patch(next.id, (cur) => ({
          ...cur,
          draft,
          draftModel: model,
          draftTokens: usage,
          draftState: undefined,
          draftError: undefined,
        }));
      } catch (e) {
        await patch(next.id, (cur) => ({ ...cur, draftState: "failed", draftError: errorText(e) }));
      }
    }
  } finally {
    running = false;
  }
}

// On app start: a draft that was in flight when the tab closed goes back in the queue.
export async function resumeQueue() {
  for (const i of await listItems()) {
    if (i.draftState === "drafting") await saveItem({ ...i, draftState: "queued" });
  }
  void runQueue();
}

// Re-renders the caller whenever a queued item changes state.
export function useQueueVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  return v;
}

export function draftLabel(item: Item): string {
  if (item.draftState === "queued") return "Waiting to draft";
  if (item.draftState === "drafting") return "Drafting…";
  if (item.draftState === "failed") return "Draft failed";
  return item.draft ? "Draft ready" : "Photos";
}

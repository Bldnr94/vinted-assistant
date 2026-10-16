// Studio step: puts whole-garment shots on a clean studio background.
// The garment is cut out and copied pixel for pixel; labels and defect close-ups stay as shot.
import { useState } from "react";
import type { Photo } from "./db";
import { Thumb, readToken, useItem, type Go } from "./App";
import { cutout, readEngine } from "./cutout";
import { IMPROVABLE, composeStudio } from "./photos";

// Average channel difference (0-255) above which the cutout no longer matches the photo.
const MAX_COLOUR_SHIFT = 6;
const FAL_COST_PER_PHOTO_USD = 0.018;

async function improve(
  photo: Photo,
  onProgress: (message: string) => void,
): Promise<Pick<Photo, "improved" | "colourShift" | "useImproved">> {
  const cut = await cutout(photo.blob, readEngine(), readToken(), onProgress);
  const { jpeg, colourShift } = await composeStudio(photo.blob, cut);
  return { improved: jpeg, colourShift, useImproved: colourShift <= MAX_COLOUR_SHIFT };
}

export function Studio({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  if (!item) return null;

  const improvable = item.photos.filter((p) => IMPROVABLE.includes(p.kind as never));
  const kept = item.photos.filter((p) => p.kind !== "ai_model" && !IMPROVABLE.includes(p.kind as never));
  const todo = improvable.filter((p) => !p.improved);
  const engine = readEngine();
  const price =
    engine === "fal" ? `about ${(todo.length * FAL_COST_PER_PHOTO_USD).toFixed(2)} USD` : "free, on this phone";

  const setPhoto = (photoId: string, patch: Partial<Photo>) =>
    update((cur) => ({ ...cur, photos: cur.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }));

  const run = async (photos: Photo[]) => {
    setError("");
    for (const [i, p] of photos.entries()) {
      const step = `Improving ${i + 1} of ${photos.length}…`;
      setBusy(step);
      try {
        await setPhoto(p.id, await improve(p, (message) => setBusy(`${step} ${message}`)));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setBusy("");
  };

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Review
        </button>
        <h1>Studio</h1>
      </header>
      <p className="hint">
        Front, back and detail shots go on a clean studio background. The garment itself is copied exactly as shot,
        so colours and defects don't change.
      </p>
      {todo.length > 0 && (
        <button className="primary" disabled={!!busy} onClick={() => run(todo)}>
          {busy || `Improve ${todo.length} ${todo.length === 1 ? "photo" : "photos"} (${price})`}
        </button>
      )}
      {busy && todo.length === 0 && <p className="hint">{busy}</p>}
      {error && <p className="error">{error}</p>}
      {improvable.map((p) => (
        <section key={p.id} className="studio-row">
          <div className="pair">
            <figure>
              <Thumb blob={p.blob} />
              <figcaption>As shot</figcaption>
            </figure>
            <figure>
              {p.improved ? <Thumb blob={p.improved} /> : <div className="thumb empty" />}
              <figcaption>Studio</figcaption>
            </figure>
          </div>
          <div className="choice">
            {p.improved ? (
              <>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={!!p.useImproved}
                    onChange={(e) => setPhoto(p.id, { useImproved: e.target.checked })}
                  />
                  Use studio version
                </label>
                {(p.colourShift ?? 0) > MAX_COLOUR_SHIFT && (
                  <p className="warn">
                    The cutout's colours differ from your photo, so the original is kept. Tick the box only if they look the
                    same to you.
                  </p>
                )}
                <button className="link" disabled={!!busy} onClick={() => run([p])}>
                  Redo
                </button>
              </>
            ) : (
              <span className="hint">Not improved yet</span>
            )}
          </div>
        </section>
      ))}
      {kept.length > 0 && (
        <>
          <p className="hint">Kept exactly as shot (labels and defects):</p>
          <div className="thumbs">
            {kept.map((p) => (
              <Thumb key={p.id} blob={p.blob} />
            ))}
          </div>
        </>
      )}
      <div className="actions">
        <button className="primary" disabled={!!busy} onClick={() => go({ name: "handoff", id })}>
          Ready to list
        </button>
      </div>
    </>
  );
}

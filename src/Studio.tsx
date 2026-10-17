// Studio step: lays whole-garment shots on a clean, natural background (wood floor, white
// sheet, light wall, your own backdrop or plain studio). The garment is cut out and copied
// pixel for pixel; labels and defect close-ups stay as shot.
import { useState } from "react";
import type { Photo } from "./db";
import { Thumb, readToken, useItem, type Go } from "./App";
import {
  BACKDROPS,
  backdropImage,
  hasOwnBackdrop,
  readBackdrop,
  saveBackdrop,
  saveOwnBackdrop,
  type BackdropId,
} from "./backdrop";
import { cutout, readEngine } from "./cutout";
import { IMPROVABLE, basePhoto, composeStudio } from "./photos";

// Average channel difference (0-255) above which the cutout no longer matches the photo.
const MAX_COLOUR_SHIFT = 6;
const FAL_COST_PER_PHOTO_USD = 0.018;

// The cutout is kept on the photo, so trying another background doesn't cut it out again.
async function improve(
  photo: Photo,
  backdrop: Blob | null,
  onProgress: (message: string) => void,
): Promise<Pick<Photo, "cutout" | "improved" | "colourShift" | "useImproved">> {
  const base = basePhoto(photo);
  const cut = photo.cutout ?? (await cutout(base, readEngine(), readToken(), onProgress));
  const { jpeg, colourShift } = await composeStudio(base, cut, backdrop);
  // A new background keeps your earlier choice; a first or redone cutout follows the colour check.
  const useImproved = photo.improved ? !!photo.useImproved : colourShift <= MAX_COLOUR_SHIFT;
  return { cutout: cut, improved: jpeg, colourShift, useImproved };
}

export function Studio({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [backdrop, setBackdrop] = useState<BackdropId>(readBackdrop);
  const [ownSaved, setOwnSaved] = useState(hasOwnBackdrop);
  if (!item) return null;

  const improvable = item.photos.filter((p) => IMPROVABLE.includes(p.kind as never));
  const kept = item.photos.filter((p) => p.kind !== "ai_model" && !IMPROVABLE.includes(p.kind as never));
  const todo = improvable.filter((p) => !p.improved);
  const engine = readEngine();
  const toCut = todo.filter((p) => !p.cutout).length;
  const price =
    engine === "fal" && toCut > 0 ? `about ${(toCut * FAL_COST_PER_PHOTO_USD).toFixed(2)} USD` : "free, on this phone";

  const setPhoto = (photoId: string, patch: Partial<Photo>) =>
    update((cur) => ({ ...cur, photos: cur.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }));

  const run = async (photos: Photo[], id: BackdropId = backdrop) => {
    setError("");
    try {
      const back = await backdropImage(id);
      for (const [i, p] of photos.entries()) {
        const step = `Improving ${i + 1} of ${photos.length}…`;
        setBusy(step);
        await setPhoto(p.id, await improve(p, back, (message) => setBusy(`${step} ${message}`)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  };

  // A new background re-lays every photo already done; it's quick because the cutouts are kept.
  const choose = (id: BackdropId) => {
    setBackdrop(id);
    saveBackdrop(id);
    if (id === "own" && !ownSaved) return;
    const done = improvable.filter((p) => p.improved);
    if (done.length) void run(done, id);
  };

  const takeOwn = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      await saveOwnBackdrop(files[0]);
      setOwnSaved(true);
      setBackdrop("own");
      saveBackdrop("own");
      const done = improvable.filter((p) => p.improved);
      if (done.length) await run(done, "own");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const needsOwn = backdrop === "own" && !ownSaved;

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Review
        </button>
        <h1>Background</h1>
      </header>
      <p className="hint">
        Front, back and detail shots are laid on a clean background with a soft shadow. The garment itself is copied
        pixel for pixel from your photo, so colours and defects don't change.
      </p>
      <div className="chips">
        {BACKDROPS.map((b) => (
          <button
            key={b.id}
            className={b.id === backdrop ? "chip on" : "chip"}
            disabled={!!busy}
            onClick={() => choose(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      {backdrop === "own" && (
        <p className="hint">
          {ownSaved ? "Using your backdrop photo. " : "Take one photo of an empty spot you like (floor, bed, table), in the light you shoot in. "}
          <label className="link inline-file">
            {ownSaved ? "Retake" : "Take backdrop photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                void takeOwn(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </p>
      )}
      {todo.length > 0 && !needsOwn && (
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
              <Thumb blob={basePhoto(p)} />
              <figcaption>{p.useFixed && p.fixed ? "Auto-fixed" : "As shot"}</figcaption>
            </figure>
            <figure>
              {p.improved ? <Thumb blob={p.improved} /> : <div className="thumb empty" />}
              <figcaption>New background</figcaption>
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
                  Use new background
                </label>
                {(p.colourShift ?? 0) > MAX_COLOUR_SHIFT && (
                  <p className="warn">
                    The cutout's colours differ from your photo, so the original is kept. Tick the box only if they look the
                    same to you.
                  </p>
                )}
                <button
                  className="link"
                  disabled={!!busy || needsOwn}
                  onClick={() => run([{ ...p, cutout: undefined, improved: undefined }])}
                >
                  Redo cutout
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
        <button className="primary" disabled={!!busy} onClick={() => go({ name: "worn", id })}>
          Next: on model
        </button>
      </div>
    </>
  );
}

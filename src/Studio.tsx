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
import { requestGeminiEnhance } from "./gemini";
import { IMPROVABLE, basePhoto, composeStudio } from "./photos";

// What Gemini is asked to put behind the garment, per built-in background ("own" needs a
// second reference photo, which the Gemini route doesn't use).
const GEMINI_BACKDROP: Record<BackdropId, string> = {
  wood: "a clean, light wooden floor",
  linen: "a smooth white bed sheet",
  wall: "a plain light-coloured wall",
  plain: "a seamless light-grey studio backdrop",
  own: "",
};

const geminiPrompt = (id: BackdropId) =>
  [
    "This is a photo of a clothing item I am selling second-hand.",
    `Replace only the background: lay the garment on ${GEMINI_BACKDROP[id]}, with soft natural lighting and a gentle shadow under it. Remove clutter, hangers, hands and furniture around it.`,
    "Keep the garment exactly as it is: same shape and size, same colour and shade, fabric texture, wrinkles, print, logo, buttons and stitching, and keep every stain, hole or defect visible. Do not clean, fix, recolour, add or remove anything on the garment.",
    "Keep the same orientation, garment centred and fully visible, portrait 3:4. Photo-realistic, no text, no watermark.",
  ].join(" ");

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

  // Gemini route (Mac extension): each photo goes through Gemini one at a time, in a Gemini tab
  // that opens by itself. Results land unapproved on the photo (see saveEnhancedPhoto in
  // extension/bridge-content.js); the Gemini tab stays in front when the last one finishes.
  const runGemini = async (photos: Photo[]) => {
    setError("");
    try {
      for (const [i, p] of photos.entries()) {
        setBusy(`Gemini ${i + 1} of ${photos.length}… about 30 s each, the Gemini tab opens by itself`);
        await requestGeminiEnhance(item.id, p.id, geminiPrompt(backdrop));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  };

  // A new background re-lays every on-device photo already done; it's quick because the
  // cutouts are kept. Gemini-made photos are left alone (they would need a new Gemini run).
  const choose = (id: BackdropId) => {
    setBackdrop(id);
    saveBackdrop(id);
    if (id === "own" && !ownSaved) return;
    const done = improvable.filter((p) => p.improved && !p.improvedBy);
    if (done.length) void run(done, id);
  };

  const takeOwn = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      await saveOwnBackdrop(files[0]);
      setOwnSaved(true);
      setBackdrop("own");
      saveBackdrop("own");
      const done = improvable.filter((p) => p.improved && !p.improvedBy);
      if (done.length) await run(done, "own");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const needsOwn = backdrop === "own" && !ownSaved;
  const geminiTodo = improvable.filter((p) => p.improvedBy !== "gemini");

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Review
        </button>
        <h1>Background</h1>
      </header>
      <p className="hint">
        Front, back and detail shots get a clean background with a soft shadow. With Gemini (Mac, free) the whole photo
        is redrawn, so you check each result against your photo before using it. The on-device option copies the garment
        pixel for pixel but cuts it out less cleanly.
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
      {geminiTodo.length > 0 && backdrop !== "own" && (
        <button className="primary" disabled={!!busy} onClick={() => runGemini(geminiTodo)}>
          {`Improve ${geminiTodo.length} ${geminiTodo.length === 1 ? "photo" : "photos"} with Gemini (Mac, free)`}
        </button>
      )}
      {backdrop === "own" && <p className="hint">Gemini can't use your own backdrop photo yet: pick another background for it.</p>}
      {todo.length > 0 && !needsOwn && (
        <button disabled={!!busy} onClick={() => run(todo)}>
          {`On this device instead: ${todo.length} ${todo.length === 1 ? "photo" : "photos"} (${price})`}
        </button>
      )}
      {busy && <p className="hint">{busy}</p>}
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
              <figcaption>{p.improvedBy === "gemini" ? "New background (Gemini)" : "New background"}</figcaption>
            </figure>
          </div>
          <div className="choice">
            {p.improved && p.improvedBy === "gemini" ? (
              <>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={!!p.useImproved}
                    onChange={(e) => setPhoto(p.id, { useImproved: e.target.checked })}
                  />
                  Use Gemini version
                </label>
                <p className="warn">
                  Gemini redrew this whole photo. Tick it only if the colour, print, logo and every defect match your
                  photo.
                </p>
                <button className="link" disabled={!!busy || backdrop === "own"} onClick={() => runGemini([p])}>
                  Redo with Gemini
                </button>
                <button
                  className="link danger"
                  disabled={!!busy}
                  onClick={() =>
                    setPhoto(p.id, { improved: undefined, improvedBy: undefined, useImproved: undefined, colourShift: undefined })
                  }
                >
                  Discard
                </button>
              </>
            ) : p.improved ? (
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

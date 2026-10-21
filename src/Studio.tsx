// Photos step: everything Gemini does to the photos, in one place. With the Chrome extension on
// a Mac it redraws the background of whole-garment shots and puts the garment on your model
// photo(s); both are free on your Google plan. Everything Gemini makes starts unticked, because
// it redraws the whole photo: you compare it with the real one before it goes on the listing.
// Labels and defect close-ups are never sent. On a phone the manual Gemini route still works.
import { useEffect, useMemo, useState } from "react";
import { AI_NOTICE, MAX_PHOTOS } from "../shared/listing";
import { Thumb, useItem, type Go } from "./App";
import { listPoses, type ModelPose, type Photo } from "./db";
import { runGeminiJob, type GeminiJob } from "./gemini";
import { BACKDROPS, backgroundPrompt, readBackdrop, saveBackdrop, tryOnPrompt, type BackdropId } from "./geminiPrompts";
import { IMPROVABLE, basePhoto, resizeToJpeg } from "./photos";
import "./model.css";

function Img({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

const minutes = (jobs: number) => Math.max(1, Math.round(jobs * 0.5));

export function Studio({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [poses, setPoses] = useState<ModelPose[]>();
  const [backdrop, setBackdrop] = useState<BackdropId>(readBackdrop);
  const [garmentId, setGarmentId] = useState<string>();
  const [styling, setStyling] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [manualPose, setManualPose] = useState(0);
  const [manualNote, setManualNote] = useState("");
  useEffect(() => {
    listPoses().then(setPoses);
  }, []);

  if (!item || !poses) return null;

  const improvable = item.photos.filter((p) => IMPROVABLE.includes(p.kind as never));
  const kept = item.photos.filter((p) => p.kind !== "ai_model" && !IMPROVABLE.includes(p.kind as never));
  const ai = item.photos.filter((p) => p.kind === "ai_model");
  // The garment shown on the model: the front shot by default, as shot (never an earlier Gemini
  // version, so the garment is not redrawn twice).
  const garment = improvable.find((p) => p.id === garmentId) ?? improvable.find((p) => p.kind === "front") ?? improvable[0];
  const todo = improvable.filter((p) => !p.improved);

  const setPhoto = (photoId: string, patch: Partial<Photo>) =>
    update((cur) => ({ ...cur, photos: cur.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }));
  const setInclude = (photoId: string, include: boolean) => setPhoto(photoId, { include });
  const removePhoto = (photoId: string) => update((cur) => ({ ...cur, photos: cur.photos.filter((p) => p.id !== photoId) }));

  const backgroundJobs = (photos: Photo[]): GeminiJob[] =>
    photos.map((p) => ({ mode: "enhance", itemId: item.id, photoId: p.id, prompt: backgroundPrompt(backdrop) }));
  const modelJobs = (): GeminiJob[] =>
    garment ? poses.map((pose) => ({ mode: "tryon", itemId: item.id, photoId: garment.id, poseId: pose.id, prompt: tryOnPrompt(styling.trim()) })) : [];

  // Jobs run one after the other: each opens Gemini on a fresh chat in a tab of its own.
  const run = async (jobs: GeminiJob[]) => {
    if (!jobs.length) return;
    const newModel = jobs.filter((j) => j.mode === "tryon").length;
    if (item.photos.length + newModel > MAX_PHOTOS) {
      setError(`Vinted allows ${MAX_PHOTOS} photos. Remove some first.`);
      return;
    }
    setError("");
    try {
      for (const [i, job] of jobs.entries()) {
        setBusy(
          `Gemini ${i + 1} of ${jobs.length} (${job.mode === "enhance" ? "background" : "model photo"})… about 30 s each, the Gemini tab opens by itself`,
        );
        await runGeminiJob(job);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  };

  const everything = [...backgroundJobs(todo), ...(ai.length === 0 ? modelJobs() : [])];

  const chooseBackdrop = (b: BackdropId) => {
    setBackdrop(b);
    saveBackdrop(b);
  };

  // Manual route for a phone: hand the model photo and the garment to the Gemini app.
  const sendToGemini = async () => {
    const pose = poses[manualPose] ?? poses[0];
    if (!pose || !garment) return;
    const files = [
      new File([pose.blob], "1-modele.jpg", { type: "image/jpeg" }),
      new File([basePhoto(garment)], "2-vetement.jpg", { type: "image/jpeg" }),
    ];
    try {
      await navigator.clipboard.writeText(tryOnPrompt(styling.trim()));
    } catch {
      // Clipboard can be blocked; the prompt is also shown below to copy by hand.
    }
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        setManualNote("Prompt copied. Pick Gemini, paste the prompt, send, then save the result and import it below.");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    for (const f of files) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    setManualNote("Prompt copied and both photos downloaded. Add them in the Gemini app in order (1 then 2), paste, send.");
  };

  const importFromGemini = async (files: FileList | null) => {
    if (!files?.length) return;
    if (item.photos.length + files.length > MAX_PHOTOS) {
      setError(`Vinted allows ${MAX_PHOTOS} photos. Remove some first.`);
      return;
    }
    const now = Date.now();
    const made: Photo[] = await Promise.all(
      Array.from(files).map(async (f, i) => ({
        id: crypto.randomUUID(),
        kind: "ai_model" as const,
        blob: await resizeToJpeg(f),
        addedAt: now + i,
        include: false,
      })),
    );
    await update((cur) => ({ ...cur, photos: [...cur.photos, ...made] }));
    setManualNote("");
  };

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "review", id })}>
          ‹ Review
        </button>
        <h1>Photos</h1>
      </header>
      <p className="hint">
        Optional. With the Chrome extension on a Mac, Gemini (free on your Google plan) gives your photos a clean
        background and puts the item on your model. Gemini redraws the whole photo, so everything it makes starts
        unticked: compare it with your real photo (colour, print, logo, defects) before using it.
      </p>

      {everything.length > 1 && (
        <button className="primary big" disabled={!!busy} onClick={() => run(everything)}>
          {`Do everything with Gemini (${everything.length} photos, about ${minutes(everything.length)} min)`}
        </button>
      )}
      {busy && <p className="hint">{busy}</p>}
      {error && <p className="error">{error}</p>}

      <h2>Background</h2>
      <div className="chips">
        {BACKDROPS.map((b) => (
          <button key={b.id} className={b.id === backdrop ? "chip on" : "chip"} disabled={!!busy} onClick={() => chooseBackdrop(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      {todo.length > 0 && (
        <button disabled={!!busy} onClick={() => run(backgroundJobs(todo))}>
          {`Improve ${todo.length} ${todo.length === 1 ? "photo" : "photos"} with Gemini (about ${minutes(todo.length)} min)`}
        </button>
      )}
      {improvable.map((p) => (
        <section key={p.id} className="studio-row">
          <div className="pair">
            <figure>
              <Thumb blob={basePhoto(p)} />
              <figcaption>{p.useFixed && p.fixed ? "Auto-fixed" : "As shot"}</figcaption>
            </figure>
            <figure>
              {p.improved ? <Thumb blob={p.improved} /> : <div className="thumb empty" />}
              <figcaption>New background (Gemini)</figcaption>
            </figure>
          </div>
          <div className="choice">
            {p.improved ? (
              <>
                <label className="inline">
                  <input type="checkbox" checked={!!p.useImproved} onChange={(e) => setPhoto(p.id, { useImproved: e.target.checked })} />
                  Use Gemini version
                </label>
                <p className="warn">Tick it only if the colour, print, logo and every defect match your photo.</p>
                <button className="link" disabled={!!busy} onClick={() => run(backgroundJobs([p]))}>
                  Redo with Gemini
                </button>
                <button
                  className="link danger"
                  disabled={!!busy}
                  onClick={() => setPhoto(p.id, { improved: undefined, useImproved: undefined })}
                >
                  Discard
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

      <h2>On model</h2>
      {poses.length === 0 ? (
        <p className="hint">
          Add your model photo once to get this item worn.{" "}
          <button className="link" onClick={() => go({ name: "model", back: { name: "studio", id } })}>
            Set up the model
          </button>
        </p>
      ) : !garment ? (
        <p className="hint">Add a front photo of the item first.</p>
      ) : (
        <>
          <p className="hint">Garment photo to put on the model (as shot):</p>
          <div className="pick">
            {improvable.map((p) => (
              <button key={p.id} className={p.id === garment.id ? "picked" : ""} onClick={() => setGarmentId(p.id)} aria-label={`Use ${p.kind} photo`}>
                <Img blob={basePhoto(p)} />
              </button>
            ))}
          </div>
          <label>
            Styling (optional)
            <input value={styling} placeholder="e.g. jacket open, shirt tucked in" onChange={(e) => setStyling(e.target.value)} />
          </label>
          <div className="actions">
            <button disabled={!!busy} onClick={() => run(modelJobs())}>
              {`${ai.length ? "Add" : "Generate"} ${poses.length} model ${poses.length === 1 ? "photo" : "photos"} with Gemini (about ${minutes(poses.length)} min)`}
            </button>
            <button className="link" onClick={() => go({ name: "model", back: { name: "studio", id } })}>
              Edit model
            </button>
          </div>

          <details className="gemini">
            <summary>On a phone: do it by hand in the Gemini app</summary>
            <p className="hint">The extension only runs on a Mac. Here you hand the photos to the Gemini app yourself.</p>
            {poses.length > 1 && (
              <div className="pick">
                {poses.map((p, i) => (
                  <button key={p.id} className={i === manualPose ? "picked" : ""} onClick={() => setManualPose(i)} aria-label={`Use pose ${i + 1}`}>
                    <Img blob={p.blob} />
                  </button>
                ))}
              </div>
            )}
            <ol className="steps">
              <li>
                <button onClick={sendToGemini}>Send model + garment to Gemini</button>
                <p className="hint">Copies the prompt and opens the share sheet. Choose Gemini, paste, send.</p>
              </li>
              <li>
                <label className="button upload">
                  Import Gemini result
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      void importFromGemini(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </li>
            </ol>
            {manualNote && <p className="hint">{manualNote}</p>}
            <details>
              <summary className="hint">Show the prompt</summary>
              <p className="hint prompt">{tryOnPrompt(styling.trim())}</p>
            </details>
          </details>
        </>
      )}

      {ai.length > 0 && (
        <>
          <p className="warn">
            AI redraws the garment. Only add a photo if colour, print, logo, length and fit match the real item. Defects do
            not show on these, so the real photos stay first.
          </p>
          <div className="ai-photos">
            {ai.map((p) => (
              <figure key={p.id} className={p.include ? "included" : ""}>
                <Img blob={p.blob} />
                <span className="badge">AI</span>
                <figcaption>
                  <label className="check">
                    <input type="checkbox" checked={!!p.include} onChange={(e) => setInclude(p.id, e.target.checked)} />
                    Add to listing
                  </label>
                  <button className="link danger" onClick={() => removePhoto(p.id)}>
                    Delete
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
          {ai.some((p) => p.include) && <p className="hint">The description will end with: “{AI_NOTICE}”</p>}
        </>
      )}

      <div className="actions">
        <button className="primary" disabled={!!busy} onClick={() => go({ name: "handoff", id })}>
          {ai.some((p) => p.include) || improvable.some((p) => p.useImproved) ? "Ready to list" : "Skip, ready to list"}
        </button>
      </div>
    </>
  );
}

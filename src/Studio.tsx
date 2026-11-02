// Photos step: everything Gemini does to the photos, in one place. With the Chrome extension on
// a Mac it redraws the background of whole-garment shots and puts the garment on your model
// photo(s); both are free on your Google plan. Everything Gemini makes starts unticked, because
// it redraws the whole photo: you compare it with the real one before it goes on the listing.
// Labels and defect close-ups are never sent. The manual route (phone, or ChatGPT) still works.
import { useEffect, useMemo, useState } from "react";
import { AI_NOTICE, MAX_PHOTOS } from "../shared/listing";
import { Thumb, useItem, type Go } from "./App";
import { listPoses, type ModelPose, type Photo } from "./db";
import { runGeminiJob, type GeminiJob } from "./gemini";
import {
  BACKDROPS,
  MANUAL_APPS,
  lookFor,
  poseFacing,
  backgroundPrompt,
  oneLine,
  readBackdrop,
  readManualApp,
  readVary,
  saveBackdrop,
  saveManualApp,
  saveVary,
  seedFromId,
  tryOnPrompt,
  type BackdropId,
  type ManualApp,
} from "./geminiPrompts";
import { collageHasAi, pickTiles, renderCollage } from "./collage";
import { IMPROVABLE, basePhoto, isMade, resizeToJpeg } from "./photos";
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
  const [manualApp, setManualApp] = useState<ManualApp>(readManualApp);
  const [vary, setVary] = useState(readVary);
  const [collageAi, setCollageAi] = useState(true);
  useEffect(() => {
    listPoses().then(setPoses);
  }, []);

  if (!item || !poses) return null;

  const improvable = item.photos.filter((p) => IMPROVABLE.includes(p.kind as never));
  const kept = item.photos.filter((p) => !isMade(p) && !IMPROVABLE.includes(p.kind as never));
  const ai = item.photos.filter((p) => p.kind === "ai_model");
  const collages = item.photos.filter((p) => p.kind === "collage" || p.kind === "collage_ai");
  // Each listing gets its own pose, light and spot (one per model photo) unless you turn it off.
  const seed = item.lookSeed ?? seedFromId(item.id);
  const lookAt = (i: number) => (vary ? lookFor(seed, i) : undefined);
  // A model photo with your back to the camera gets the item's back photo when there is one.
  const backShot = improvable.find((p) => p.kind === "back");
  const garmentFor = (i: number) => (poseFacing(poses[i], i) === "back" && backShot ? backShot : garment);
  const promptFor = (i: number) => {
    const g = garmentFor(i);
    return tryOnPrompt(styling.trim(), lookAt(i), poseFacing(poses[i], i), g?.kind === "back" ? "back" : "front");
  };
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
    garment ? poses.map((pose, i) => ({ mode: "tryon", itemId: item.id, photoId: garmentFor(i)!.id, poseId: pose.id, prompt: oneLine(promptFor(i)) })) : [];

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

  const app = MANUAL_APPS.find((a) => a.id === manualApp) ?? MANUAL_APPS[0];
  const chooseApp = (a: ManualApp) => {
    setManualApp(a);
    saveManualApp(a);
    setManualNote("");
  };

  // Manual route: hand the model photo and the garment to the Gemini or ChatGPT app yourself.
  const sendToApp = async () => {
    const i = poses[manualPose] ? manualPose : 0;
    const pose = poses[i];
    const g = garmentFor(i);
    if (!pose || !g) return;
    const files = [
      new File([pose.blob], "1-modele.jpg", { type: "image/jpeg" }),
      new File([basePhoto(g)], "2-vetement.jpg", { type: "image/jpeg" }),
    ];
    try {
      await navigator.clipboard.writeText(promptFor(i));
    } catch {
      // Clipboard can be blocked; the prompt is also shown below to copy by hand.
    }
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        setManualNote(`Prompt copied. Pick ${app.label}, paste the prompt, send, then save the result and import it below.`);
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
    window.open(app.url, "_blank", "noopener");
    setManualNote(`Prompt copied and both photos downloaded. In ${app.label}, add them in order (1 then 2), paste, send.`);
  };

  const makeCollage = async () => {
    const tiles = pickTiles(item.photos, collageAi);
    if (tiles.top.length + tiles.bottom.length < 3) {
      setError("A collage needs at least 3 photos: add the front, labels or details first.");
      return;
    }
    if (!collages.length && item.photos.length >= MAX_PHOTOS) {
      setError(`Vinted allows ${MAX_PHOTOS} photos. Remove some first.`);
      return;
    }
    setError("");
    const blob = await renderCollage(tiles);
    const photo: Photo = {
      id: crypto.randomUUID(),
      kind: collageHasAi(tiles) ? "collage_ai" : "collage",
      blob,
      addedAt: Date.now(),
      include: true,
    };
    // One collage per listing: a new one replaces the old.
    await update((cur) => ({ ...cur, photos: [...cur.photos.filter((p) => p.kind !== "collage" && p.kind !== "collage_ai"), photo] }));
  };

  const importResult = async (files: FileList | null) => {
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
          <label className="inline">
            <input
              type="checkbox"
              checked={vary}
              onChange={(e) => {
                setVary(e.target.checked);
                saveVary(e.target.checked);
              }}
            />
            New pose, light and spot for each listing
          </label>
          {vary ? (
            <div className="looks">
              <p className="hint">
                This listing: {lookFor(seed).light}; {lookFor(seed).spot}; {lookFor(seed).shoes}. The same for every model
                photo, so front and back match.
              </p>
              {poses.map((pose, i) => (
                <p key={pose.id} className="hint">
                  {`Model photo ${i + 1} (${poseFacing(pose, i) === "back" ? "back to camera" : "facing the mirror"}${
                    poseFacing(pose, i) === "back" ? (backShot ? ", with the item's back photo" : ", no back photo of the item yet") : ""
                  }): ${lookFor(seed, i).pose}.`}
                </p>
              ))}
              <button className="link" disabled={!!busy} onClick={() => update((cur) => ({ ...cur, lookSeed: Math.floor(Math.random() * 2 ** 32) }))}>
                Shuffle the look
              </button>
            </div>
          ) : (
            <p className="hint">Off: every listing keeps the exact pose, light and framing of your model photo.</p>
          )}
          <div className="actions">
            <button disabled={!!busy} onClick={() => run(modelJobs())}>
              {`${ai.length ? "Add" : "Generate"} ${poses.length} model ${poses.length === 1 ? "photo" : "photos"} with Gemini (about ${minutes(poses.length)} min)`}
            </button>
            <button className="link" onClick={() => go({ name: "model", back: { name: "studio", id } })}>
              Edit model
            </button>
          </div>

          <details className="gemini">
            <summary>By hand in the Gemini or ChatGPT app</summary>
            <p className="hint">
              The extension only runs Gemini, on a Mac. Here you hand the photos to the app yourself, on your own plan.
            </p>
            <div className="chips">
              {MANUAL_APPS.map((a) => (
                <button key={a.id} className={a.id === manualApp ? "chip on" : "chip"} onClick={() => chooseApp(a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
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
                <button onClick={sendToApp}>{`Send model + garment to ${app.label}`}</button>
                <p className="hint">{`Copies the prompt and opens the share sheet. Choose ${app.label}, paste, send.`}</p>
              </li>
              <li>
                <label className="button upload">
                  {`Import ${app.label} result`}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      void importResult(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </li>
            </ol>
            {manualNote && <p className="hint">{manualNote}</p>}
            <details>
              <summary className="hint">Show the prompt</summary>
              <p className="hint prompt">{promptFor(manualPose)}</p>
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

      <h2>Collage</h2>
      <p className="hint">
        One photo showing the item, worn, and its labels and details, like many sellers' first photo. It is made on this
        phone from your photos, cropped to fit; nothing is redrawn.
      </p>
      {ai.some((p) => p.include) && (
        <label className="inline">
          <input type="checkbox" checked={collageAi} onChange={(e) => setCollageAi(e.target.checked)} />
          Include my approved model photo
        </label>
      )}
      <div className="actions">
        <button disabled={!!busy} onClick={() => void makeCollage()}>
          {collages.length ? "Remake the collage" : "Make a collage"}
        </button>
      </div>
      {collages.map((p) => (
        <section key={p.id} className="collage">
          <figure className={p.include ? "included" : ""}>
            <Img blob={p.blob} />
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
          <p className="hint">
            {p.kind === "collage"
              ? "Real photos only, so it goes first: your cover photo."
              : "It contains an AI photo, so it goes second, right after your real front photo, and the description says the worn photos are AI."}
          </p>
        </section>
      ))}

      <div className="actions">
        <button className="primary" disabled={!!busy} onClick={() => go({ name: "handoff", id })}>
          {ai.some((p) => p.include) || collages.some((p) => p.include) || improvable.some((p) => p.useImproved)
            ? "Ready to list"
            : "Skip, ready to list"}
        </button>
      </div>
    </>
  );
}

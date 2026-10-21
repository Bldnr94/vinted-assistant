// "On your model" step, between Studio and List it: puts the garment on each saved
// model pose with FASHN Try-On Max. The results are AI illustrations: they start
// unapproved, go after every real photo, and add the AI notice to the description.
import { useEffect, useMemo, useState } from "react";
import { AI_NOTICE, MAX_PHOTOS } from "../shared/listing";
import { errorText, postJson } from "./api";
import { useItem, type Go } from "./App";
import { listPoses, type ModelPose, type Photo } from "./db";
import { basePhoto, dataUriToBlob, IMPROVABLE, resizeToJpeg, toBase64 } from "./photos";
import "./model.css";

const garmentBlob = (p: Photo) => (p.useImproved && p.improved ? p.improved : basePhoto(p));

// For the manual Gemini route: the user pastes this in the Gemini app with the two photos.
const GEMINI_PROMPT = (styling: string) =>
  [
    "Image 1 is a person, image 2 is a clothing item.",
    "Dress the person in image 1 in the clothing item from image 2.",
    "Keep everything else in image 1 exactly as it is: the person, body, pose, the phone hiding the face, hair, the mirror, the room, the light and the framing.",
    "Copy the clothing item exactly: same colour and shade, fabric, texture, print, logo, buttons, pockets, seams, length and cut. Do not add, remove or invent any detail.",
    "Replace only the piece of clothing it replaces; keep the other clothes and the shoes.",
    styling ? `Styling: ${styling}.` : "",
    "Photo-realistic, same size and format as image 1.",
  ]
    .filter(Boolean)
    .join(" ");

function Img({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

export function ModelPhotos({ id, go }: { id: string; go: Go }) {
  const [item, update] = useItem(id);
  const [poses, setPoses] = useState<ModelPose[]>();
  const [garmentId, setGarmentId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [geminiPose, setGeminiPose] = useState(0);
  const [geminiNote, setGeminiNote] = useState("");
  useEffect(() => {
    listPoses().then(setPoses);
  }, []);

  if (!item || !poses) return null;
  const onSetup = () => go({ name: "model", back: { name: "worn", id } });
  const garments = item.photos.filter((p) => (IMPROVABLE as string[]).includes(p.kind));
  const ai = item.photos.filter((p) => p.kind === "ai_model");
  // Default to the front shot; its studio version is used when you chose it.
  const garment = garments.find((p) => p.id === garmentId) ?? garments.find((p) => p.kind === "front") ?? garments[0];

  const generate = async () => {
    if (!garment || !poses?.length) return;
    if (item.photos.length + poses.length > MAX_PHOTOS) {
      setError(`Vinted allows ${MAX_PHOTOS} photos. Remove some first.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const product = await toBase64(garmentBlob(garment));
      const results = await Promise.allSettled(
        poses.map(async (pose) => {
          const { image } = await postJson<{ image: string }>("/api/tryon", {
            product,
            product_type: "jpeg",
            model: await toBase64(pose.blob),
            prompt: prompt.trim(),
          });
          return resizeToJpeg(await dataUriToBlob(image));
        }),
      );
      const now = Date.now();
      const made: Photo[] = results.flatMap((r, i) =>
        r.status === "fulfilled" ? [{ id: crypto.randomUUID(), kind: "ai_model", blob: r.value, addedAt: now + i, include: false }] : [],
      );
      if (made.length) await update((cur) => ({ ...cur, photos: [...cur.photos, ...made] }));
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) setError(`${results.length - made.length} of ${results.length} failed: ${errorText(failed.reason)}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Gemini route, step 1: hand the model photo and the garment to the Gemini app (share sheet, or download).
  const sendToGemini = async () => {
    const pose = poses?.[geminiPose] ?? poses?.[0];
    if (!pose || !garment) return;
    const files = [
      new File([pose.blob], "1-modele.jpg", { type: "image/jpeg" }),
      new File([garmentBlob(garment)], "2-vetement.jpg", { type: "image/jpeg" }),
    ];
    try {
      await navigator.clipboard.writeText(GEMINI_PROMPT(prompt.trim()));
    } catch {
      // Clipboard can be blocked; the prompt is also shown below to copy by hand.
    }
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files });
        setGeminiNote("Prompt copied. Pick Gemini, paste the prompt, send, then save the result and import it below.");
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
    setGeminiNote("Prompt copied and both photos downloaded. Add them in the Gemini app in order (1 then 2), paste, send.");
  };

  // Gemini route, step 2: bring the result back as an unapproved AI photo, like a FASHN one.
  const importFromGemini = async (files: FileList | null) => {
    if (!files?.length) return;
    if (item.photos.length + files.length > MAX_PHOTOS) {
      setError(`Vinted allows ${MAX_PHOTOS} photos. Remove some first.`);
      return;
    }
    const now = Date.now();
    const made: Photo[] = await Promise.all(
      Array.from(files).map(async (f, i) => {
        const blob = await resizeToJpeg(f);
        return { id: crypto.randomUUID(), kind: "ai_model" as const, blob, addedAt: now + i, include: false };
      }),
    );
    await update((cur) => ({ ...cur, photos: [...cur.photos, ...made] }));
    setGeminiNote("");
  };

  const setInclude = (id: string, include: boolean) =>
    update((cur) => ({ ...cur, photos: cur.photos.map((p) => (p.id === id ? { ...p, include } : p)) }));
  const remove = (id: string) => update((cur) => ({ ...cur, photos: cur.photos.filter((p) => p.id !== id) }));

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "studio", id })}>
          ‹ Background
        </button>
        <h1>On model</h1>
      </header>
      <p className="hint">
        Optional. Puts this item on your AI model. These are AI illustrations: they go after your real photos and the
        description says so.
      </p>
      {poses.length === 0 ? (
        <p className="hint">
          Create your AI model once to get photos of this item worn.{" "}
          <button className="link" onClick={onSetup}>
            Set up the model
          </button>
        </p>
      ) : garments.length === 0 ? (
        <p className="hint">Add a front photo of the item first.</p>
      ) : (
        <>
          <p className="hint">Garment photo to put on the model:</p>
          <div className="pick">
            {garments.map((p) => (
              <button
                key={p.id}
                className={p.id === garment?.id ? "picked" : ""}
                onClick={() => setGarmentId(p.id)}
                aria-label={`Use ${p.kind} photo`}
              >
                <Img blob={garmentBlob(p)} />
              </button>
            ))}
          </div>
          <label>
            Styling (optional)
            <input
              value={prompt}
              placeholder="e.g. jacket open, shirt tucked in"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <div className="actions">
            <button className="primary" disabled={busy || !garment} onClick={generate}>
              {busy
                ? "Generating… keep this screen open"
                : `Generate ${poses.length} ${poses.length === 1 ? "photo" : "photos"} (≈ ${(poses.length * 0.23).toFixed(2)} USD)`}
            </button>
            <button className="link" onClick={onSetup}>
              Edit model
            </button>
          </div>

          <details className="gemini">
            <summary>Or use the Gemini app (included in your Google plan)</summary>
            <p className="hint">
              No cost per photo, but done by hand and less faithful than the button above: check the result closely.
            </p>
            {poses.length > 1 && (
              <div className="pick">
                {poses.map((p, i) => (
                  <button
                    key={p.id}
                    className={i === geminiPose ? "picked" : ""}
                    onClick={() => setGeminiPose(i)}
                    aria-label={`Use pose ${i + 1}`}
                  >
                    <Img blob={p.blob} />
                  </button>
                ))}
              </div>
            )}
            <ol className="steps">
              <li>
                <button onClick={sendToGemini} disabled={!garment}>
                  Send model + garment to Gemini
                </button>
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
                      importFromGemini(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </li>
            </ol>
            {geminiNote && <p className="hint">{geminiNote}</p>}
            <details>
              <summary className="hint">Show the prompt</summary>
              <p className="hint prompt">{GEMINI_PROMPT(prompt.trim())}</p>
            </details>
          </details>
        </>
      )}
      {error && <p className="error">{error}</p>}

      {ai.length > 0 && (
        <>
          <p className="warn">
            AI redraws the garment. Only add a photo if colour, print, logo, length and fit match the real item. Defects
            do not show on these, so the real photos stay first.
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
                  <button className="link danger" onClick={() => remove(p.id)}>
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
        <button className="primary" disabled={busy} onClick={() => go({ name: "handoff", id })}>
          {ai.some((p) => p.include) ? "Ready to list" : "Skip, ready to list"}
        </button>
      </div>
    </>
  );
}

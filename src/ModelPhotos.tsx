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

  const setInclude = (id: string, include: boolean) =>
    update((cur) => ({ ...cur, photos: cur.photos.map((p) => (p.id === id ? { ...p, include } : p)) }));
  const remove = (id: string) => update((cur) => ({ ...cur, photos: cur.photos.filter((p) => p.id !== id) }));

  return (
    <>
      <header>
        <button className="link" onClick={() => go({ name: "studio", id })}>
          ‹ Studio
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

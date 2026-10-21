// Your model: up to 3 photos of yourself or a model, added once. Gemini puts each garment on
// these exact photos, so every listing shows the same body, pose and room. Use a photo that
// looks like a private seller's own shot at home; no face in frame is a good idea.
import { useEffect, useMemo, useState } from "react";
import { deletePose, listPoses, savePose, type ModelPose } from "./db";
import { resizeToJpeg } from "./photos";
import "./model.css";

export const MAX_POSES = 3;

function PoseImage({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

export function ModelSetup({ onBack }: { onBack: () => void }) {
  const [poses, setPoses] = useState<ModelPose[]>();
  const [error, setError] = useState("");

  const reload = () => listPoses().then(setPoses);
  useEffect(() => {
    reload();
  }, []);

  if (!poses) return null;
  const full = poses.length >= MAX_POSES;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    try {
      for (const f of Array.from(files).slice(0, MAX_POSES - poses.length)) {
        await savePose({ id: crypto.randomUUID(), blob: await resizeToJpeg(f), createdAt: Date.now(), prompt: "" });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header>
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
        <h1>My model</h1>
      </header>
      <p className="hint">
        Add one to {MAX_POSES} photos of yourself or a model, once. In the Photos step Gemini puts each garment on these same
        photos, one model photo per photo here, so every listing shows the same body, pose and room, like a seller's own photo
        at home.
      </p>

      {poses.length > 0 && (
        <div className="poses">
          {poses.map((p, i) => (
            <figure key={p.id}>
              <PoseImage blob={p.blob} />
              <figcaption>
                Photo {i + 1}
                <button
                  className="link danger"
                  onClick={async () => {
                    if (!confirm("Delete this photo?")) return;
                    await deletePose(p.id);
                    await reload();
                  }}
                >
                  Delete
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!full && (
        <section className="model-new">
          <label className="button upload primary">
            {poses.length ? "Add another photo" : "Add my model photo"}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <p className="hint">
            Good choices: a mirror selfie in your own room with the phone hiding your face, or a photo from the chin down,
            against a plain wall, in a plain fitted t-shirt and trousers (Gemini swaps that outfit for the garment). The
            photos stay on this device and only go to Gemini when you run it.
          </p>
        </section>
      )}
    </>
  );
}

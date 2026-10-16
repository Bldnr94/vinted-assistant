// Your AI model: one person, created once, in up to 3 poses. Every try-on reuses
// these exact photos, so the person, outfit base and backdrop stay the same on
// every listing.
import { useEffect, useMemo, useState } from "react";
import { errorText, postJson } from "./api";
import { deletePose, listPoses, savePose, type ModelPose } from "./db";
import { dataUriToBlob, resizeToJpeg, toBase64 } from "./photos";
import "./model.css";

export const MAX_POSES = 3;
// FASHN credits at about 0.075 USD each: model-create 2k balanced is 3 per image,
// plus 3 per image when a face reference keeps the same person.
const COST_FIRST = "about 0.45 USD";
const COST_MORE = "about 0.90 USD";

const PRESETS: { label: string; prompt: string }[] = [
  {
    label: "Woman",
    prompt:
      "Ultra realistic full-body fashion photo of a woman in her late twenties, natural make-up, shoulder-length brown hair tied back, slim average build, wearing a plain fitted white t-shirt, slim light blue jeans and plain white sneakers. Plain light grey studio wall and floor, soft even daylight lighting, sharp focus, head to toe in frame, e-commerce catalogue style.",
  },
  {
    label: "Man",
    prompt:
      "Ultra realistic full-body fashion photo of a man in his early thirties, short dark hair, light stubble, average athletic build, wearing a plain fitted white t-shirt, slim dark grey chinos and plain white sneakers. Plain light grey studio wall and floor, soft even daylight lighting, sharp focus, head to toe in frame, e-commerce catalogue style.",
  },
];

const POSES = [
  "Standing straight, facing the camera, arms relaxed at the sides, neutral friendly expression.",
  "Three-quarter turn to the left, weight on one leg, one hand in a pocket, looking at the camera.",
  "Walking slowly towards the camera, natural stride, arms relaxed.",
];

const PROMPT_KEY = "model-prompt";
const readPrompt = () => {
  try {
    return localStorage.getItem(PROMPT_KEY) ?? PRESETS[0].prompt;
  } catch {
    return PRESETS[0].prompt;
  }
};

function PoseImage({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

export function ModelSetup({ onBack }: { onBack: () => void }) {
  const [poses, setPoses] = useState<ModelPose[]>();
  const [person, setPerson] = useState(readPrompt);
  const [pose, setPose] = useState(POSES[0]);
  const [candidates, setCandidates] = useState<{ uri: string; base: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = () => listPoses().then(setPoses);
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (poses?.length) setPose(POSES[Math.min(poses.length, POSES.length - 1)]);
  }, [poses?.length]);

  if (!poses) return null;
  const first = poses[0];
  const full = poses.length >= MAX_POSES;

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      try {
        localStorage.setItem(PROMPT_KEY, person);
      } catch {
        // Only a convenience; the prompt is also kept with each saved pose.
      }
      // Later poses reuse the person text of pose 1 and its face as a reference.
      const base = first ? first.prompt || person : person;
      const prompt = first
        ? `${base} Same person, same outfit, same studio. Pose: ${pose}`
        : `${base} Pose: ${pose}`;
      const { images } = await postJson<{ images: string[] }>("/api/model", {
        prompt,
        face_reference: first ? await toBase64(first.blob) : undefined,
      });
      setCandidates(images.map((uri) => ({ uri, base })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const keep = async (blob: Blob, prompt: string) => {
    // prompt is the person text only (no pose), so later poses can reuse it.
    await savePose({ id: crypto.randomUUID(), blob: await resizeToJpeg(blob), createdAt: Date.now(), prompt });
    setCandidates([]);
    await reload();
  };

  return (
    <>
      <header>
        <button className="link" onClick={onBack}>
          ‹ Back
        </button>
        <h1>AI model</h1>
      </header>
      <p className="hint">
        Create one model once. Each garment is then put on these same photos, so every listing shows the same person,
        pose and backdrop. Each pose gives one AI photo per item (about 0.23 USD each).
      </p>

      {poses.length > 0 && (
        <div className="poses">
          {poses.map((p, i) => (
            <figure key={p.id}>
              <PoseImage blob={p.blob} />
              <figcaption>
                Pose {i + 1}
                <button
                  className="link danger"
                  onClick={async () => {
                    if (!confirm(i === 0 && poses.length > 1 ? "Delete pose 1? Later poses keep their face." : "Delete this pose?")) return;
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

      {!full && (
        <section className="model-new">
          <h2>{first ? `Add pose ${poses.length + 1}` : "Describe your model"}</h2>
          {!first && (
            <>
              <div className="actions">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => setPerson(p.prompt)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label>
                Person, base outfit and backdrop
                <textarea rows={6} value={person} onChange={(e) => setPerson(e.target.value)} />
              </label>
              <p className="hint">
                Keep the base outfit plain and fitted (white t-shirt, slim trousers): try-on swaps it for your garment.
              </p>
            </>
          )}
          <label>
            Pose
            <textarea rows={2} value={pose} onChange={(e) => setPose(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="primary" disabled={busy || !person.trim() || !pose.trim()} onClick={generate}>
              {busy ? "Creating… (up to a minute)" : candidates.length ? "Try again" : "Create 2 options"}
            </button>
            <label className="button upload">
              Use my own photo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) await keep(f, "");
                }}
              />
            </label>
          </div>
          <p className="hint">
            {first ? COST_MORE : COST_FIRST} per try. "Use my own photo": a full-body photo of yourself, or of someone who
            agreed, against a plain wall.
          </p>
          {candidates.length > 0 && (
            <div className="poses">
              {candidates.map((c) => (
                <figure key={c.uri.slice(-40)}>
                  <img src={c.uri} alt="" />
                  <button className="primary" onClick={async () => keep(await dataUriToBlob(c.uri), c.base)}>
                    Use this
                  </button>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

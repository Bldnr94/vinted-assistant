// Your AI model: one body, created once, in up to 3 poses. Every try-on reuses
// these exact photos, so the body, outfit base and room stay the same on every
// listing. Photos are framed from the chin down and look like a phone photo at
// home, like a private seller's own "worn" shots, not a catalogue.
import { useEffect, useMemo, useState } from "react";
import { errorText, postJson } from "./api";
import { deletePose, listPoses, savePose, type ModelPose } from "./db";
import { dataUriToBlob, resizeToJpeg } from "./photos";
import "./model.css";

export const MAX_POSES = 3;
// FASHN credits at about 0.075 USD each: model-create 2k balanced is 3 per image, 2 images.
const COST_TRY = "about 0.45 USD";

// Shared by both presets: how the photo looks and how it is framed.
const LOOK =
  "Casual smartphone photo taken at home by a friend, not a professional shoot: standing in front of a plain off-white wall in a bright apartment, wooden floor, soft natural window light, slightly imperfect framing, no studio lights, no retouching. Framed from the chin down to the shoes: the face and head are out of frame, not visible.";

const PRESETS: { label: string; prompt: string }[] = [
  {
    label: "Woman",
    prompt:
      `Realistic photo of a woman's body, slim average build, wearing a plain fitted white t-shirt, slim light blue jeans and plain white sneakers. ${LOOK}`,
  },
  {
    label: "Man",
    prompt:
      `Realistic photo of a man's body, average build, wearing a plain fitted white t-shirt, slim dark grey chinos and plain white sneakers. ${LOOK}`,
  },
];

const POSES = [
  "Standing straight, facing the camera, arms relaxed at the sides.",
  "Slight three-quarter turn to the left, weight on one leg, one hand in a pocket.",
  "Relaxed stance, hands loosely together in front, slight bend in one knee.",
];

const PROMPT_KEY = "model-prompt-v2"; // v1 held the studio-style prompt
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
      // Later poses reuse the text of pose 1; with no face in frame, body, outfit and room carry the likeness.
      const base = first ? first.prompt || person : person;
      const prompt = first
        ? `${base} Same body, same outfit, same room and light. Pose: ${pose}`
        : `${base} Pose: ${pose}`;
      const { images } = await postJson<{ images: string[] }>("/api/model", { prompt });
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
        Create one model once. Each garment is then put on these same photos, so every listing shows the same body,
        pose and room, framed from the chin down like a photo taken at home. Each pose gives one AI photo per item
        (about 0.08 USD each).
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
                    if (!confirm("Delete this pose?")) return;
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
                Body, base outfit and room
                <textarea rows={6} value={person} onChange={(e) => setPerson(e.target.value)} />
              </label>
              <p className="hint">
                Keep the base outfit plain and fitted (white t-shirt, slim trousers): try-on swaps it for your garment.
                Keep "face out of frame" if you don't want a face on your listings.
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
            {COST_TRY} per try. "Use my own photo": a photo of yourself (or someone who agreed) from the chin down,
            against a plain wall, in a plain fitted t-shirt and trousers. Free.
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

// POST /api/model — creates candidate photos of your AI model (FASHN Model Create).
// Done once or twice in Settings; every listing then reuses the chosen photos.

import { checkRequest, isBase64Image, json, readJson, runFashn } from "../../shared/server";

interface Env {
  APP_TOKEN: string;
  FASHN_API_KEY: string;
}

interface ModelRequest {
  prompt?: unknown;
  face_reference?: unknown; // base64 JPEG of the chosen first pose, to keep the same person
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = checkRequest(request, env as unknown as Record<string, unknown>, ["FASHN_API_KEY"]);
  if (denied) return denied;

  const body = await readJson<ModelRequest>(request);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1500) : "";
  if (!prompt) return json({ error: "Describe the model first." }, 400);

  const inputs: Record<string, unknown> = {
    prompt,
    resolution: "2k",
    generation_mode: "balanced",
    aspect_ratio: "3:4",
    num_images: 2,
    output_format: "jpeg",
  };
  if (body?.face_reference !== undefined) {
    if (!isBase64Image(body.face_reference)) return json({ error: "face_reference must be base64 JPEG." }, 400);
    inputs.face_reference = `data:image/jpeg;base64,${body.face_reference}`;
    inputs.face_reference_mode = "match_base"; // follow the prompt's pose, keep the face
  }

  try {
    const images = await runFashn(env.FASHN_API_KEY, "model-create", inputs);
    return json({ images });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

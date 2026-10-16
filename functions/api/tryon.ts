// POST /api/tryon — puts the garment on one of your saved model photos (FASHN Try-On Max).
// Keeps the model's identity, pose and backdrop, so every listing shows the same person.

import { checkRequest, isBase64Image, json, readJson, runFashn, seedOf } from "../../shared/server";

interface Env {
  APP_TOKEN: string;
  FASHN_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = checkRequest(request, env as unknown as Record<string, unknown>, ["FASHN_API_KEY"]);
  if (denied) return denied;

  const body = await readJson<{ product?: unknown; product_type?: unknown; model?: unknown; prompt?: unknown; seed?: unknown }>(request);
  if (!isBase64Image(body?.product) || !isBase64Image(body?.model)) {
    return json({ error: "Send product and model as base64 images." }, 400);
  }
  const productType = body.product_type === "png" ? "png" : "jpeg";

  try {
    const [image] = await runFashn(env.FASHN_API_KEY, "tryon-max", {
      product_image: `data:image/${productType};base64,${body.product}`,
      model_image: `data:image/jpeg;base64,${body.model}`,
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 300) : "",
      resolution: "2k",
      generation_mode: "balanced",
      output_format: "jpeg",
      seed: seedOf(body.seed),
      return_base64: true,
    });
    return json({ image });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

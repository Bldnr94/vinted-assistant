// POST /api/enhance — cuts the garment out of one photo (Bria RMBG 2.0 on fal.ai).
// Returns a PNG with a transparent background. The phone composes the studio
// background itself, so the garment's own pixels are never redrawn.

import { checkRequest, isBase64Image, json, readJson, toDataUri } from "../../shared/server";

interface Env {
  APP_TOKEN: string;
  FAL_KEY: string;
  FAL_BASE_URL?: string; // only for local tests against a mock
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = checkRequest(request, env as unknown as Record<string, unknown>, ["FAL_KEY"]);
  if (denied) return denied;

  const body = await readJson<{ image?: unknown }>(request);
  if (!isBase64Image(body?.image)) return json({ error: "Send one JPEG photo as base64 in image." }, 400);

  const res = await fetch(`${env.FAL_BASE_URL || "https://fal.run"}/fal-ai/bria/background/remove`, {
    method: "POST",
    headers: { authorization: `Key ${env.FAL_KEY}`, "content-type": "application/json" },
    // sync_mode returns the result inline and keeps it out of fal's request history.
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${body.image}`, sync_mode: true }),
  });
  const out = (await res.json().catch(() => ({}))) as { image?: { url?: string }; detail?: unknown };
  if (!res.ok || !out.image?.url) {
    return json({ error: `Background removal failed: ${JSON.stringify(out.detail ?? res.status)}` }, 502);
  }
  // With sync_mode the url is already a data URI; toDataUri downloads it otherwise.
  return json({ cutout: await toDataUri(out.image.url) });
};

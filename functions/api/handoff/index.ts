// POST /api/handoff — stores one listing (fields + photos) for one hour and returns a
// random code. The vinted.fr script fetches it with GET /api/handoff/<code>.

import type { HandoffPackage } from "../../../shared/listing";
import { MAX_PHOTOS } from "../../../shared/listing";
import { checkRequest, isBase64Image, json, readJson } from "../../../shared/server";

interface Env {
  APP_TOKEN: string;
  HANDOFF: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.HANDOFF) return json({ error: "Server is missing the HANDOFF KV binding (see README)." }, 500);
  const denied = checkRequest(request, env as unknown as Record<string, unknown>, []);
  if (denied) return denied;

  const body = await readJson<HandoffPackage>(request);
  const l = body?.listing;
  if (!l || typeof l.title !== "string" || typeof l.description !== "string") {
    return json({ error: "Missing listing fields." }, 400);
  }
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (!photos.length || photos.length > MAX_PHOTOS || !photos.every(isBase64Image)) {
    return json({ error: `Send 1 to ${MAX_PHOTOS} base64 JPEG photos.` }, 400);
  }

  const code = crypto.randomUUID();
  await env.HANDOFF.put(code, JSON.stringify({ listing: l, photos }), { expirationTtl: 3600 });
  return json({ code, url: new URL(`/api/handoff/${code}`, request.url).toString() });
};

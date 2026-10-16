// GET /api/handoff/<code> — read by the vinted.fr form-filling script. The code is a
// random UUID that expires after one hour, so it works as the only credential here.
// In Cloudflare Access, bypass this path (see README) so the script can reach it.

import { json } from "../../../shared/server";

interface Env {
  HANDOFF: KVNamespace;
}

const CORS = {
  "access-control-allow-origin": "https://www.vinted.fr",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: CORS });

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const code = String(params.code ?? "");
  if (!/^[0-9a-f-]{36}$/.test(code)) return withCors(json({ error: "Bad code." }, 400));
  const value = env.HANDOFF ? await env.HANDOFF.get(code) : null;
  if (!value) return withCors(json({ error: "This listing has expired. Send it again from the app." }, 404));
  return withCors(new Response(value, { headers: { "content-type": "application/json; charset=utf-8" } }));
};

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

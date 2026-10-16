// Helpers for the Pages Functions in functions/api/. Not bundled into the app.

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Returns an error response when the request lacks the app token or the server
// lacks one of the named secrets; null when the request may go ahead.
export function checkRequest(
  request: Request,
  env: { APP_TOKEN?: string } & Record<string, unknown>,
  secrets: string[],
): Response | null {
  const missing = ["APP_TOKEN", ...secrets].filter((k) => !env[k]);
  if (missing.length) return json({ error: `Server is missing ${missing.join(", ")}.` }, 500);
  if (request.headers.get("x-app-token") !== env.APP_TOKEN) {
    return json({ error: "Wrong or missing app token. Set it in Settings." }, 401);
  }
  return null;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function isBase64Image(v: unknown): v is string {
  return typeof v === "string" && v.length > 100 && /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 200));
}

// Downloads an image URL (or decodes a data URI) and returns it as a data URI,
// so the phone never has to fetch from a third-party CDN.
export async function toDataUri(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the result (${res.status})`);
  const type = res.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

const FASHN = "https://api.fashn.ai/v1";

// FASHN seeds are 0 to 2^32 - 1; the same seed and inputs give the same image.
export function seedOf(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2 ** 32
    ? v
    : Math.floor(Math.random() * 2 ** 32);
}

// Runs one FASHN prediction and waits for it. Returns the output images as data URIs.
export async function runFashn(
  apiKey: string,
  modelName: string,
  inputs: Record<string, unknown>,
  timeoutMs = 170_000,
): Promise<string[]> {
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  const start = await fetch(`${FASHN}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model_name: modelName, inputs }),
  });
  const started = (await start.json().catch(() => ({}))) as { id?: string; error?: unknown };
  if (!start.ok || !started.id) {
    throw new Error(`FASHN refused the request: ${JSON.stringify(started.error ?? start.status)}`);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`${FASHN}/status/${started.id}`, { headers });
    const s = (await res.json().catch(() => ({}))) as {
      status?: string;
      output?: string[];
      error?: { name?: string; message?: string } | null;
    };
    if (s.status === "completed" && s.output?.length) return Promise.all(s.output.map(toDataUri));
    if (s.status === "failed") throw new Error(`FASHN failed: ${s.error?.message ?? s.error?.name ?? "unknown error"}`);
  }
  throw new Error("FASHN took too long; try again.");
}

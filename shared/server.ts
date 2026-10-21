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

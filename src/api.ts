// Calls to this app's own /api functions, with the app token from Settings.

import { readToken } from "./App";

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-token": readToken() },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
  if (!res.ok) throw new Error(out.error || `Server answered ${res.status}`);
  return out as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

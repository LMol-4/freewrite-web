import { appOrigin } from "../lib/auth/validation";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: PRIVATE_HEADERS }); }
export function trustedOrigin(request: Request, required = false) {
  const origin = request.headers.get("origin");
  if (!origin) return !required;
  try { appOrigin(origin); return true; } catch { return false; }
}
export async function boundedJson(request: Request, max = 16384) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw Error("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw Error("Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

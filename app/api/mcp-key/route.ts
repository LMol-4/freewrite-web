import { createClient } from "@/src/lib/supabase/server";
import { ensureKey, readKey, replaceKey } from "@/src/mcp/backend";
import { keyError } from "@/src/mcp/errors";
import { boundedJson, json, trustedOrigin, UUID } from "@/src/mcp/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function owner() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user?.id;
}
export async function GET() {
  try {
    const id = await owner(); if (!id) return json({ error: "Sign in to manage your key." }, 401);
    return json({ credential: await readKey(id) });
  } catch (error) { return json({ error: keyError(error) }, 503); }
}
export async function POST(request: Request) {
  if (!trustedOrigin(request, true)) return json({ error: "Untrusted origin." }, 403);
  let input: { action?: unknown; generation?: unknown };
  try { input = await boundedJson(request) as typeof input; if (!input || typeof input !== "object") throw Error(); }
  catch { return json({ error: "Invalid request." }, 400); }
  try {
    const id = await owner(); if (!id) return json({ error: "Sign in to manage your key." }, 401);
    if (input.action === "ensure") return json({ credential: await ensureKey(id) });
    if (input.action === "reveal") return json({ credential: await readKey(id, true) });
    if (input.action !== "replace" || typeof input.generation !== "string" || !UUID.test(input.generation)) return json({ error: "Invalid request." }, 400);
    if (!await replaceKey(id, input.generation)) return json({ error: "Your key changed in another window. Reload before rotating again." }, 409);
    return json({ credential: await readKey(id) });
  } catch (error) { return json({ error: keyError(error) }, 503); }
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { decryptKey, encryptKey, generateKey, keyHash } from "./crypto";
import { randomUUID } from "node:crypto";
import { McpSetupError } from "./errors";

function databaseError(error: { code?: string }) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")) {
    throw new McpSetupError("The MCP connector needs a database update. Please contact the site owner.");
  }
  throw Error("MCP database unavailable");
}

// Never import this module in a client component. All reads must be scoped to
// the identity established by the browser session or the verified MCP key.
export function backend() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new McpSetupError("The MCP connector is not configured yet. Please contact the site owner.");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
}
export async function readKey(userId: string, reveal = false) {
  const { data, error } = await backend().from("mcp_keys").select("generation,ciphertext,created_at,last_used_at").eq("user_id", userId).maybeSingle();
  if (error) databaseError(error);
  return data ? { generation: data.generation, createdAt: data.created_at, lastUsedAt: data.last_used_at,
    ...(reveal ? { key: decryptKey(data.ciphertext, userId) } : {}) } : null;
}
export async function ensureKey(userId: string) {
  const existing = await readKey(userId);
  if (existing) return existing;
  // A concurrent opener may win the compare-and-swap. Always return the winner;
  // opening this page must never rotate an existing credential.
  await replaceKey(userId, null);
  const credential = await readKey(userId);
  if (!credential) throw Error("Key unavailable");
  return credential;
}
export async function replaceKey(userId: string, expected: string | null) {
  const key = generateKey();
  const { data, error } = await backend().rpc("replace_mcp_key", {
    // Generated RPC types omit nullable parameters; SQL deliberately accepts null for first generation.
    p_user_id: userId, p_expected: expected!, p_generation: randomUUID(),
    p_hash: keyHash(key), p_ciphertext: encryptKey(key, userId),
  });
  if (error) databaseError(error);
  return data;
}
export async function authenticateKey(header: string | null) {
  const match = /^Bearer (fw_[A-Za-z0-9_-]{43})$/i.exec(header ?? "");
  if (!match) return null;
  const { data, error } = await backend().rpc("authenticate_mcp_key", { p_hash: keyHash(match[1]) });
  if (error) throw Error("Authentication unavailable");
  return data[0] ?? null;
}

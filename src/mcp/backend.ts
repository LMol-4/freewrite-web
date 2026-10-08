import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { decryptKey, encryptKey, generateKey, keyHash } from "./crypto";
import { randomUUID } from "node:crypto";

// Never import this module in a client component. All reads must be scoped to
// the identity established by the browser session or the verified MCP key.
export function backend() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Error("MCP server is not configured");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
}
export async function readKey(userId: string, reveal = false) {
  const { data, error } = await backend().from("mcp_keys").select("generation,ciphertext,created_at,last_used_at").eq("user_id", userId).maybeSingle();
  if (error) throw Error("Key unavailable");
  return data ? { generation: data.generation, createdAt: data.created_at, lastUsedAt: data.last_used_at,
    ...(reveal ? { key: decryptKey(data.ciphertext, userId) } : {}) } : null;
}
export async function replaceKey(userId: string, expected: string | null) {
  const key = generateKey();
  const { data, error } = await backend().rpc("replace_mcp_key", {
    // Generated RPC types omit nullable parameters; SQL deliberately accepts null for first generation.
    p_user_id: userId, p_expected: expected!, p_generation: randomUUID(),
    p_hash: keyHash(key), p_ciphertext: encryptKey(key, userId),
  });
  if (error) throw Error("Key unavailable");
  return data;
}
export async function authenticateKey(header: string | null) {
  const match = /^Bearer (fw_[A-Za-z0-9_-]{43})$/i.exec(header ?? "");
  if (!match) return null;
  const { data, error } = await backend().rpc("authenticate_mcp_key", { p_hash: keyHash(match[1]) });
  if (error) throw Error("Authentication unavailable");
  return data[0] ?? null;
}

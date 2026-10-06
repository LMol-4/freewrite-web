import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/supabase/database.types";
import { retryAfterDelay } from "../../lib/supabase/fetch";
import { digest, RemoteError, type RemoteStore, type PublicationResult } from "../sync/types";

function fail(error: { message: string; status?: number; statusCode?: string | number; code?: string }) : never {
  const status = Number(error.status ?? error.statusCode);
  throw new RemoteError(error.message, status === 401 ? "auth" : status === 403 || error.code === "42501" ? "permission" :
    (status >= 400 && status < 500 && status !== 408 && status !== 429) || error.code === "22023" ? "integrity" : "retry",
    Math.max(retryAfterDelay(), status === 429 ? 30000 : 0));
}
export function createRemoteEntryStore(client: SupabaseClient<Database>, userId: string, active: () => boolean = () => true): RemoteStore {
  function check() { if (!active()) throw new RemoteError("Session changed. Sign in again to sync.", "auth"); }
  async function authorize() {
    if (retryAfterDelay() > 0) throw new RemoteError("The server requested a retry delay. Writing is saved locally.", "retry", retryAfterDelay());
    check(); const { data, error } = await client.auth.getUser(); check();
    if (error) fail(error);
    if (data.user?.id !== userId) throw new RemoteError("Sign in again to sync this account.", "auth");
  }
  const bucket = client.storage.from("notes");
  async function download(path: string, sha: string | null) {
    const { data, error } = await bucket.download(path); check();
    if (error) fail(error);
    const body = await data.text();
    if (sha && await digest(body) !== sha) throw new RemoteError("The cloud body failed its integrity check. Local writing was retained.", "integrity");
    return body;
  }
  return {
    async list(cursor) {
      await authorize();
      let query = client.from("entries").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      const { data, error } = await query; check(); if (error) fail(error);
      const last = data.at(-1);
      // Continue even after a short page; only an empty page establishes traversal end.
      return { rows: data, next: last ? { createdAt: last.created_at, id: last.id } : undefined };
    },
    async get(id) {
      await authorize(); const { data, error } = await client.from("entries").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
      check(); if (error) fail(error); return data;
    },
    async body(entry) { await authorize(); if (entry.user_id !== userId) throw new RemoteError("Account mismatch", "permission"); return download(entry.storage_path, entry.body_sha256); },
    async publish(mutation) {
      await authorize();
      if (mutation.userId !== userId) throw new RemoteError("Account mismatch", "permission");
      // Resolve ambiguous publication before touching an object which deletion may have removed.
      const receipt = await client.from("entry_receipts").select("request,result").eq("user_id", userId).eq("mutation_id", mutation.mutationId).maybeSingle();
      check(); if (receipt.error) fail(receipt.error);
      if (!receipt.data && mutation.request.operation !== "delete") {
        if (mutation.body === null || await digest(mutation.body) !== mutation.request.sha256) throw new RemoteError("Frozen body does not match its digest.", "integrity");
        const { error } = await bucket.upload(mutation.request.path, new Blob([mutation.body], { type: "text/markdown;charset=utf-8" }), { upsert: false, contentType: "text/markdown;charset=utf-8" });
        check();
        if (error) {
          // Only a storage duplicate triggers verification; arbitrary uniqueness errors aren't success.
          if (String(error.statusCode) !== "409" && error.message !== "The resource already exists") fail(error);
          await download(mutation.request.path, mutation.request.sha256);
        }
      }
      check();
      const { data, error } = await client.rpc("publish_entry", { p_mutation_id: mutation.mutationId, p_request: { ...mutation.request } as Json });
      check(); if (error) fail(error);
      const result = data as unknown as PublicationResult;
      if (!result || !["ok", "conflict", "deleted", "missing"].includes(result.status) || (result.entry && result.entry.user_id !== userId)) throw new RemoteError("Invalid publication response", "integrity");
      return result;
    },
    async cleanup(task) {
      await authorize();
      if (task.userId !== userId || !(task.path.startsWith(`${userId}/${task.entryId}/`) || task.path === `${userId}/${task.entryId}.md`)) throw new RemoteError("Invalid cleanup path", "integrity");
      if (task.wholeEntry) {
        const row = await this.get(task.entryId);
        if (!row?.deleted_at) throw new RemoteError("Cleanup requires a confirmed tombstone", "integrity");
        // Restart at offset zero after each removal; failed tasks remain durable locally.
        for (;;) {
          const { data, error } = await bucket.list(`${userId}/${task.entryId}`, { limit: 100, offset: 0 }); check(); if (error) fail(error);
          if (!data.length) break;
          const removed = await bucket.remove(data.map(object => `${userId}/${task.entryId}/${object.name}`)); check(); if (removed.error) fail(removed.error);
        }
        const legacy = await bucket.remove([`${userId}/${task.entryId}.md`]); check(); if (legacy.error) fail(legacy.error);
      } else {
        const row = await this.get(task.entryId);
        if (row?.storage_path === task.path && !row.deleted_at) throw new RemoteError("Refusing to remove a published body", "integrity");
        const { error } = await bucket.remove([task.path]); check(); if (error) fail(error);
      }
    },
  };
}

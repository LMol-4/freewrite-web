import { createHash } from "node:crypto";
import { backend } from "./backend";
import type { NoteRepository, NoteRow } from "./notes";
import type { Database } from "../lib/supabase/database.types";
type StoredNote = Database["public"]["Tables"]["entries"]["Row"];
export function noteRepository(userId: string): NoteRepository {
  const client = backend();
  const rows = new Map<string, StoredNote>();
  function remember(row: StoredNote) { rows.set(row.id, row); return row; }
  return {
    async list(limit, cursor) {
      let query = client.from("entries").select("*").eq("user_id", userId).is("deleted_at", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (cursor) query = query.or("created_at.lt." + cursor.createdAt + ",and(created_at.eq." + cursor.createdAt + ",id.lt." + cursor.id + ")");
      const { data, error } = await query;
      if (error) throw Error("Notes unavailable");
      return data.map(remember);
    },
    async get(id) {
      const { data, error } = await client.from("entries").select("*").eq("user_id", userId).eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw Error("Note unavailable");
      return data ? remember(data) : null;
    },
    async body(meta: NoteRow) {
      const row = rows.get(meta.id);
      if (!row || row.user_id !== userId || row.deleted_at) throw Error("Note unavailable");
      const expected = row.revision_id ? userId + "/" + row.id + "/" + row.revision_id + ".md" : userId + "/" + row.id + ".md";
      if (row.storage_path !== expected) throw Error("Invalid note path");
      const { data, error } = await client.storage.from("notes").download(expected);
      if (error) throw Error("Note unavailable");
      const body = await data.text();
      if (row.body_sha256 && createHash("sha256").update(body).digest("hex") !== row.body_sha256) throw Error("Invalid note body");
      return body;
    },
  };
}

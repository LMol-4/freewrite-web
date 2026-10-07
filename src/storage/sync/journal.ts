import { checkFence, openFreewriteDB, type LocalEntry } from "../local/indexeddb";
import { digest, type Mutation, type RemoteEntry, type Cleanup } from "./types";

const stores = ["entries", "pending", "outbox", "cleanup", "meta"] as const;
export function fromRemote(row: RemoteEntry, body: string | null, generation = 1): LocalEntry {
  return { userId: row.user_id, id: row.id, body, createdAt: row.created_at, updatedAt: row.updated_at,
    previewText: row.preview_text, wordCount: row.word_count, charCount: row.char_count, version: row.version,
    baseServerVersion: row.version, localGeneration: generation, dirty: false, recovered: row.is_recovered,
    revisionId: row.revision_id, storagePath: row.storage_path, sha256: row.body_sha256,
    conflictOf: row.conflict_of, deleted: row.deleted_at !== null };
}
export function createJournal(userId: string, owner: string) {
  async function transaction<T>(fn: (tx: import("idb").IDBPTransaction<import("../local/indexeddb").FreewriteDB, typeof stores, "readwrite">) => Promise<T>) {
    const tx = (await openFreewriteDB()).transaction(stores, "readwrite");
    try { await checkFence(tx, userId, owner); const value = await fn(tx); await tx.done; return value; }
    catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw error; }
  }
  return {
    async entries() { return (await openFreewriteDB()).getAllFromIndex("entries", "account", userId); },
    async mutations() { return (await openFreewriteDB()).getAllFromIndex("outbox", "account", userId); },
    async cleanups() { return (await openFreewriteDB()).getAllFromIndex("cleanup", "account", userId); },
    async freeze(entry: LocalEntry): Promise<Mutation | null> {
      // Crypto is deliberately outside the IDB transaction; recheck the generation inside it.
      const sha = entry.body === null ? null : await digest(entry.body);
      const revisionId = crypto.randomUUID();
      return transaction(async tx => {
        const attempted = (await tx.objectStore("outbox").index("account").getAll(userId)).find(m => m.entryId === entry.id);
        if (attempted) return attempted;
        const current = await tx.objectStore("entries").get([userId, entry.id]);
        if (!current?.dirty || current.localGeneration !== entry.localGeneration) return null;
        if (!current.deleted && (current.body === null || (current.baseServerVersion === null && !current.recovered && !current.body.trim()))) return null;
        if (current.deleted && current.baseServerVersion === null) {
          await tx.objectStore("entries").delete([userId, entry.id]);
          await tx.objectStore("pending").delete([userId, entry.id]); return null;
        }
        const mutation: Mutation = { userId, entryId: entry.id, mutationId: crypto.randomUUID(), generation: current.localGeneration,
          body: current.body, attempts: 0, retryAt: 0, request: { id: entry.id,
            operation: current.deleted ? "delete" : current.baseServerVersion === null ? "create" : "update",
            expectedVersion: current.deleted ? current.deleteVersion ?? current.baseServerVersion : current.baseServerVersion,
            revisionId: current.deleted ? null : revisionId, sha256: current.deleted ? null : sha,
            path: current.deleted ? current.storagePath ?? "" : `${userId}/${entry.id}/${revisionId}.md`,
            createdAt: current.createdAt, updatedAt: current.updatedAt, preview: current.previewText,
            wordCount: current.wordCount, charCount: current.charCount, recovered: current.recovered, conflictOf: current.conflictOf ?? null } };
        await tx.objectStore("outbox").put(mutation);
        return mutation;
      });
    },
    retry(mutation: Mutation, retryAt: number, failure?: Mutation["failure"]) { return transaction(async tx => {
      const live = await tx.objectStore("outbox").get([userId, mutation.mutationId]);
      if (live) await tx.objectStore("outbox").put({ ...live, attempts: live.attempts + 1, retryAt, failure });
    }); },
    acknowledge(m: Mutation, row: RemoteEntry) { return transaction(async tx => {
      if (!await tx.objectStore("outbox").get([userId, m.mutationId])) return;
      const entry = await tx.objectStore("entries").get([userId, m.entryId]);
      if (!entry) throw Error("Pending writing is missing; acknowledgement retained.");
      const same = entry.localGeneration === m.generation;
      await tx.objectStore("entries").put({ ...entry, baseServerVersion: row.version, version: row.version,
        revisionId: row.revision_id, storagePath: row.storage_path, sha256: row.body_sha256,
        dirty: !same, deleted: row.deleted_at !== null || entry.deleted,
        // A delete following our own ambiguous write may use its receipt version.
        deleteVersion: entry.deleted && m.request.operation !== "delete" ? row.version : entry.deleteVersion });
      if (same) await tx.objectStore("pending").delete([userId, m.entryId]);
      if (row.deleted_at) await tx.objectStore("cleanup").put({ userId, entryId: row.id, path: row.storage_path, wholeEntry: true });
      await tx.objectStore("outbox").delete([userId, m.mutationId]);
    }); },
    adopt(row: RemoteEntry, body: string | null, expectedGeneration?: number) { return transaction(async tx => {
      if (row.user_id !== userId) throw Error("Account mismatch");
      const entry = await tx.objectStore("entries").get([userId, row.id]);
      if (entry?.dirty || (expectedGeneration !== undefined && entry?.localGeneration !== expectedGeneration)) return false;
      if (entry && (entry.baseServerVersion ?? 0) > row.version) return false;
      await tx.objectStore("entries").put(fromRemote(row, body, (entry?.localGeneration ?? 0) + 1)); return true;
    }); },
    recover(m: Mutation, canonical: RemoteEntry | null, body: string | null) { return transaction(async tx => {
      if (!await tx.objectStore("outbox").get([userId, m.mutationId])) return null;
      const entry = await tx.objectStore("entries").get([userId, m.entryId]);
      if (!entry) throw Error("Conflict snapshot missing");
      // Snapshot the latest committed generation, including typing during the network attempt.
      let recovered: LocalEntry | null = null;
      if (m.request.operation !== "delete") {
        const id = crypto.randomUUID();
        recovered = { ...entry, id, body: entry.body ?? m.body, recovered: true, conflictOf: canonical ? canonical.id : null,
          baseServerVersion: null, revisionId: null, storagePath: undefined, sha256: null,
          localGeneration: 1, version: 0, dirty: true, deleted: false, deleteVersion: undefined };
        await tx.objectStore("entries").put(recovered);
        await tx.objectStore("pending").put({ userId, entryId: id, generation: 1 });
      }
      if (canonical) await tx.objectStore("entries").put(fromRemote(canonical, body, entry.localGeneration + 1));
      else {
        // Missing rows never authorize erasing the local text. Preserve as the recovered row.
        await tx.objectStore("entries").put({ ...entry, dirty: false, recovered: true, deleted: false });
      }
      await tx.objectStore("pending").delete([userId, entry.id]);
      await tx.objectStore("outbox").delete([userId, m.mutationId]);
      if (m.request.operation !== "delete") await tx.objectStore("cleanup").put({ userId, entryId: m.entryId, path: m.request.path, wholeEntry: false });
      return recovered;
    }); },
    delete(entryId: string, expectedGeneration: number) { return transaction(async tx => {
      const entry = await tx.objectStore("entries").get([userId, entryId]);
      if (!entry || entry.deleted || entry.localGeneration !== expectedGeneration) throw Error("Entry changed; review before deleting.");
      const generation = entry.localGeneration + 1;
      await tx.objectStore("entries").put({ ...entry, deleted: true, dirty: true, deleteVersion: entry.baseServerVersion, localGeneration: generation });
      await tx.objectStore("pending").put({ userId, entryId, generation });
    }); },
    cleanupEmpty(entryId: string, expectedGeneration: number, selectedId: string) { return transaction(async tx => {
      const entries = tx.objectStore("entries");
      const entry = await entries.get([userId, entryId]);
      const selected = await entries.get([userId, selectedId]);
      if (!entry || entryId === selectedId || !selected || selected.deleted || selected.recovered || entry.deleted || entry.recovered ||
        entry.localGeneration !== expectedGeneration || entry.body === null || entry.body.trim() !== "") return "retained" as const;
      const attempted = (await tx.objectStore("outbox").index("account").getAll(userId)).some(m => m.entryId === entryId);
      if (attempted) return "retained" as const;
      if (entry.baseServerVersion === null) {
        await entries.delete([userId, entryId]); await tx.objectStore("pending").delete([userId, entryId]);
        return "removed" as const;
      }
      if (entry.dirty || await tx.objectStore("pending").get([userId, entryId])) return "retained" as const;
      const generation = entry.localGeneration + 1;
      await entries.put({ ...entry, deleted: true, dirty: true, deleteVersion: entry.baseServerVersion, localGeneration: generation });
      await tx.objectStore("pending").put({ userId, entryId, generation });
      return "queued" as const;
    }); },
    cleaned(task: Cleanup) { return transaction(async tx => { await tx.objectStore("cleanup").delete([userId, task.path]); }); },
    async hasPending() {
      const db = await openFreewriteDB();
      const all = await db.getAllFromIndex("entries", "account", userId);
      return all.some(e => e.dirty && (e.deleted || e.recovered || e.baseServerVersion !== null || !!e.body?.trim())) ||
        (await db.countFromIndex("outbox", "account", userId)) > 0 || (await db.countFromIndex("cleanup", "account", userId)) > 0;
    },
  };
}
export type Journal = ReturnType<typeof createJournal>;

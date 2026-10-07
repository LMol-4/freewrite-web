import { NEW_ENTRY_BODY } from "../core/entry";
import { newestFirst } from "../core/entry-order";
import { createIndexedDBEntryStore } from "./local/indexeddb";
import { createJournal } from "./sync/journal";
import type { RemoteStore } from "./sync/types";

/** Entry navigation loads bodies without replacing unavailable writing with an empty note. */
export function createEntryLifecycle(userId: string, owner: string, remote: RemoteStore) {
  const local = createIndexedDBEntryStore(userId, owner);
  const journal = createJournal(userId, owner);
  return {
    async list() {
      return (await journal.entries()).filter(e => !e.deleted).sort(newestFirst);
    },
    async load(id: string) {
      let entry = await local.get(id);
      if (!entry || entry.deleted) throw Error("This entry is no longer available. Choose another entry.");
      if (entry.body === null) {
        const row = await remote.get(id);
        if (!row || row.deleted_at) throw Error("This entry is unavailable in the cloud. Local writing has been retained.");
        const body = await remote.body(row);
        await journal.adopt(row, body, entry.localGeneration);
        entry = await local.get(id);
      }
      if (!entry || entry.deleted || entry.body === null) throw Error("This entry is not downloaded. Reconnect and try again.");
      return entry;
    },
    async newEntry(currentId?: string) {
      const current = currentId ? await local.get(currentId) : null;
      if (current && !current.deleted && !current.recovered && current.body !== null && !current.body.trim()) return current;
      return local.create({ body: NEW_ENTRY_BODY });
    },
    restore(id: string, generation: number) { return local.restore(id, generation); },
    delete(id: string, generation: number) { return journal.delete(id, generation); },
    cleanupEmpty(id: string, generation: number, selectedId: string) { return journal.cleanupEmpty(id, generation, selectedId); },
  };
}

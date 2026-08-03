import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { deriveCharCount, derivePreview, deriveWordCount } from "../../core/entry";
import { generateEntryId } from "../../core/id";
import { type Entry, type EntryMeta, type EntryStore, VersionConflictError } from "../types";

const DB_NAME = "freewrite";
const DB_VERSION = 1;
const STORE_NAME = "entries";

interface FreewriteDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
  };
}

function openFreewriteDB(): Promise<IDBPDatabase<FreewriteDB>> {
  return openDB<FreewriteDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    },
  });
}

function toMeta(entry: Entry): EntryMeta {
  const { id, createdAt, updatedAt, previewText, wordCount, charCount, version } = entry;
  return { id, createdAt, updatedAt, previewText, wordCount, charCount, version };
}

/** IndexedDB implementation of `EntryStore` (§6, §12). Local-only for M2 — no outbox, no remote. */
export function createIndexedDBEntryStore(): EntryStore {
  const dbPromise = openFreewriteDB();

  return {
    async list(opts) {
      const db = await dbPromise;
      let all = await db.getAll(STORE_NAME);
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (opts?.before) {
        const beforeIso = opts.before.toISOString();
        all = all.filter((entry) => entry.createdAt < beforeIso);
      }
      if (opts?.limit !== undefined) {
        all = all.slice(0, opts.limit);
      }
      return all.map(toMeta);
    },

    async get(id) {
      const db = await dbPromise;
      const entry = await db.get(STORE_NAME, id);
      return entry ?? null;
    },

    async create(input) {
      const db = await dbPromise;
      const now = (input.createdAt ?? new Date()).toISOString();
      const entry: Entry = {
        id: generateEntryId(),
        createdAt: now,
        updatedAt: now,
        previewText: derivePreview(input.body),
        wordCount: deriveWordCount(input.body),
        charCount: deriveCharCount(input.body),
        version: 1,
        body: input.body,
      };
      await db.add(STORE_NAME, entry);
      return entry;
    },

    async update(id, body, expectedVersion) {
      const db = await dbPromise;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const existing = await tx.store.get(id);
      if (!existing) {
        throw new Error(`entry not found: ${id}`);
      }
      if (existing.version !== expectedVersion) {
        throw new VersionConflictError(id);
      }
      const updated: Entry = {
        ...existing,
        body,
        previewText: derivePreview(body),
        wordCount: deriveWordCount(body),
        charCount: deriveCharCount(body),
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      };
      await tx.store.put(updated);
      await tx.done;
      return updated;
    },

    async delete(id) {
      const db = await dbPromise;
      await db.delete(STORE_NAME, id);
    },
  };
}

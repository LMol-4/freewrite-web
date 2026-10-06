import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from "idb";
import { deriveCharCount, derivePreview, deriveWordCount, NEW_ENTRY_BODY } from "../../core/entry";
import { generateEntryId } from "../../core/id";
import { type Entry, type EntryMeta, VersionConflictError } from "../types";
import type { PreferenceState } from "../preferences";

export interface LocalEntry extends Entry {
  userId: string;
  localGeneration: number;
  baseServerVersion: number | null;
  dirty: boolean;
  recovered: boolean;
}
interface Meta { key: string; owner?: string; expires?: number; locked?: boolean; cleanup?: boolean; count?: number }
export interface FreewriteDB extends DBSchema {
  entries: { key: [string, string]; value: LocalEntry; indexes: { account: string } };
  legacy: { key: string; value: Entry };
  pending: { key: [string, string]; value: { userId: string; entryId: string; generation: number }; indexes: { account: string } };
  preferences: { key: string; value: PreferenceState };
  meta: { key: string; value: Meta };
}
let connection: Promise<IDBPDatabase<FreewriteDB>> | undefined;
export function openFreewriteDB() {
  if (!connection) connection = openDB<FreewriteDB>("freewrite", 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      db.createObjectStore("legacy", { keyPath: "id" });
      db.createObjectStore("meta", { keyPath: "key" });
      if (oldVersion === 1) {
        // Keep exact ownerless records; never adopt them into the signing-in account.
        const legacy = await tx.objectStore("entries").getAll();
        for (const entry of legacy) await tx.objectStore("legacy").put(entry);
        await tx.objectStore("meta").put({ key: "legacy", count: legacy.length });
        db.deleteObjectStore("entries");
      }
      db.createObjectStore("entries", { keyPath: ["userId", "id"] }).createIndex("account", "userId");
      db.createObjectStore("pending", { keyPath: ["userId", "entryId"] }).createIndex("account", "userId");
      db.createObjectStore("preferences", { keyPath: "userId" });
    },
    blocking() { void connection?.then(db => db.close()); connection = undefined; notifyUpgrade(); },
    blocked() { notifyUpgrade(); },
    terminated() { connection = undefined; notifyUpgrade(); },
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}
function notifyUpgrade() { if (typeof window !== "undefined") window.dispatchEvent(new Event("freewrite:reload-required")); }
export async function closeDatabase() { (await connection)?.close(); connection = undefined; }
const stores = ["entries", "pending", "meta"] as const;
type WriteTx = IDBPTransaction<FreewriteDB, typeof stores, "readwrite">;
export async function checkFence(tx: { objectStore(name: "meta"): { get(key: string): Promise<Meta | undefined> } }, userId: string, owner: string) {
  const state = await tx.objectStore("meta").get(userId);
  if (state?.locked || state?.owner !== owner || (state.expires ?? 0) <= Date.now()) throw Error("Writing is locked. Keep this text and reload to reconnect.");
}
export async function claimAccount(userId: string, owner: string, now = Date.now(), ownsWebLock = false) {
  const db = await openFreewriteDB();
  const tx = db.transaction("meta", "readwrite");
  const state = await tx.store.get(userId);
  const claimed = !state?.locked && (ownsWebLock || !state?.owner || state.owner === owner || (state.expires ?? 0) <= now);
  if (claimed) await tx.store.put({ key: userId, owner, expires: now + 15000 });
  await tx.done;
  return claimed;
}
export async function releaseAccount(userId: string, owner: string) {
  const db = await openFreewriteDB();
  const tx = db.transaction("meta", "readwrite");
  const state = await tx.store.get(userId);
  if (state?.owner === owner) await tx.store.put({ ...state, owner: undefined, expires: 0 });
  await tx.done;
}
/** Renewal never reacquires a lease lost to another token, even after it expires. */
export async function renewAccount(userId: string, owner: string, now = Date.now()) {
  const db = await openFreewriteDB();
  const tx = db.transaction("meta", "readwrite");
  const state = await tx.store.get(userId);
  const renewed = state?.owner === owner && !state.locked;
  if (renewed) await tx.store.put({ ...state, expires: now + 15000 });
  await tx.done;
  return renewed;
}
export async function setAccountLock(userId: string, owner: string, locked: boolean, cleanup = false) {
  const db = await openFreewriteDB();
  const tx = db.transaction("meta", "readwrite");
  const state = await tx.store.get(userId);
  if (state?.owner !== owner) throw Error("Another tab owns this account. Reload before signing out.");
  await tx.store.put({ ...state, key: userId, locked, cleanup, expires: Date.now() + 15000 });
  await tx.done;
}
export async function clearAccount(userId: string) {
  const db = await openFreewriteDB();
  const tx = db.transaction(["entries", "pending", "preferences", "meta"], "readwrite");
  for (const name of ["entries", "pending"] as const) {
    for (const key of await tx.objectStore(name).index("account").getAllKeys(userId)) await tx.objectStore(name).delete(key);
  }
  await tx.objectStore("preferences").delete(userId);
  // Remain locked until an authenticated subsequent visit explicitly reopens it.
  await tx.objectStore("meta").put({ key: userId, locked: true, cleanup: false });
  await tx.done;
}
export async function resumeAccount(userId: string) {
  const db = await openFreewriteDB();
  const state = await db.get("meta", userId);
  if (state?.cleanup) await clearAccount(userId);
  // Interrupted sign-out without confirmed session removal retains drafts.
  const tx = db.transaction("meta", "readwrite");
  const current = await tx.store.get(userId);
  if (current?.locked && (!current.owner || (current.expires ?? 0) <= Date.now())) await tx.store.put({ key: userId });
  await tx.done;
}
function toMeta(e: LocalEntry): EntryMeta { const { id, createdAt, updatedAt, previewText, wordCount, charCount, version } = e; return { id, createdAt, updatedAt, previewText, wordCount, charCount, version }; }
function makeEntry(userId: string, body: string, createdAt = new Date(), recovered = false): LocalEntry {
  return { userId, id: generateEntryId(), body, createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
    previewText: derivePreview(body), wordCount: deriveWordCount(body), charCount: deriveCharCount(body),
    version: 1, localGeneration: 1, baseServerVersion: null, dirty: true, recovered };
}
async function put(tx: WriteTx, entry: LocalEntry) {
  await tx.objectStore("entries").put(entry);
  await tx.objectStore("pending").put({ userId: entry.userId, entryId: entry.id, generation: entry.localGeneration });
}
export function createIndexedDBEntryStore(userId: string, owner: string) {
  if (!userId || !owner) throw Error("An account and writer token are required");
  async function write<T>(operation: (tx: WriteTx) => Promise<T>): Promise<T> {
    const db = await openFreewriteDB();
    const tx = db.transaction(stores, "readwrite");
    try { await checkFence(tx, userId, owner); const result = await operation(tx); await tx.done; return result; }
    catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw error; }
  }
  return {
    async list(opts?: { before?: Date; limit?: number }) {
      let all = await (await openFreewriteDB()).getAllFromIndex("entries", "account", userId);
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      if (opts?.before) all = all.filter(e => e.createdAt < opts.before!.toISOString());
      return all.slice(0, opts?.limit).map(toMeta);
    },
    async get(id: string) { return (await (await openFreewriteDB()).get("entries", [userId, id])) ?? null; },
    ensureEntry() { return write(async tx => {
      const all = await tx.objectStore("entries").index("account").getAll(userId);
      const existing = all.filter(e => !e.recovered).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
      if (existing) return existing;
      const entry = makeEntry(userId, NEW_ENTRY_BODY); await put(tx, entry); return entry;
    }); },
    create(input: { body: string; createdAt?: Date }) { return write(async tx => { const entry = makeEntry(userId, input.body, input.createdAt); await put(tx, entry); return entry; }); },
    update(id: string, body: string, expectedGeneration: number) { return write(async tx => {
      const existing = await tx.objectStore("entries").get([userId, id]);
      if (!existing) throw Error(`entry not found: ${id}`);
      if (existing.localGeneration !== expectedGeneration) throw new VersionConflictError(id);
      const updated = { ...existing, body, previewText: derivePreview(body), wordCount: deriveWordCount(body), charCount: deriveCharCount(body), updatedAt: new Date().toISOString(), localGeneration: existing.localGeneration + 1, version: existing.version + 1, dirty: true };
      await put(tx, updated); return updated;
    }); },
    recover(body: string) { return write(async tx => { const entry = makeEntry(userId, body, new Date(), true); await put(tx, entry); return entry; }); },
    delete(id: string) { return write(async tx => { await tx.objectStore("entries").delete([userId, id]); await tx.objectStore("pending").delete([userId, id]); }); },
    async hasWriting() { return (await (await openFreewriteDB()).getAllFromIndex("entries", "account", userId)).some(e => e.body.trim() !== ""); },
  };
}

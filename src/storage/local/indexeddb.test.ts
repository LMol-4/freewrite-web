import "fake-indexeddb/auto";
import { openDB, deleteDB } from "idb";
import { beforeEach, expect, it } from "vitest";
import { claimAccount, clearAccount, closeDatabase, createIndexedDBEntryStore, openFreewriteDB, renewAccount, resumeAccount, setAccountLock } from "./indexeddb";
import { VersionConflictError } from "../types";
beforeEach(async () => { await closeDatabase(); await deleteDB("freewrite"); });
async function store(user = "a", owner = "tab-a") { expect(await claimAccount(user, owner)).toBe(true); return createIndexedDBEntryStore(user, owner); }
it("atomically creates one blank under concurrent initialization", async () => {
  const s = await store(); const results = await Promise.all([s.ensureEntry(), s.ensureEntry(), s.ensureEntry()]);
  expect(new Set(results.map(e => e.id)).size).toBe(1);
});
it("commits body and pending generation together and checks stale writers", async () => {
  const s = await store(); const e = await s.ensureEntry(); const saved = await s.update(e.id, "complete body", e.localGeneration);
  expect(await s.get(e.id)).toEqual(saved);
  expect(await (await openFreewriteDB()).get("pending", ["a", e.id])).toMatchObject({ generation: saved.localGeneration });
  await expect(s.update(e.id, "stale", e.localGeneration)).rejects.toBeInstanceOf(VersionConflictError);
  expect((await s.get(e.id))?.body).toBe("complete body");
});
it("isolates accounts and cleanup leaves other accounts untouched", async () => {
  const a = await store(); const b = await store("b", "tab-b");
  const ea = await a.create({ body: "private A" }); const eb = await b.create({ body: "private B" });
  expect(await b.get(ea.id)).toBeNull(); expect(await a.get(eb.id)).toBeNull();
  await clearAccount("a"); expect(await a.list()).toHaveLength(0); expect((await b.get(eb.id))?.body).toBe("private B");
});
it("quarantines exact v1 records without exposing or deleting them", async () => {
  const old = await openDB("freewrite", 1, { upgrade(db) { db.createObjectStore("entries", { keyPath: "id" }); } });
  const legacy = { id: "old", body: "owner unknown", custom: "preserve this too" };
  await old.put("entries", legacy); old.close();
  const s = await store(); expect(await s.list()).toEqual([]);
  await clearAccount("a"); const db = await openFreewriteDB();
  expect(await db.get("legacy", "old")).toEqual(legacy);
  expect(await db.get("meta", "legacy")).toMatchObject({ count: 1 });
});
it("fallback lease takeover fences the old tab, including late acknowledgements", async () => {
  const a = await store(); const e = await a.ensureEntry();
  expect(await claimAccount("a", "tab-b")).toBe(false);
  expect(await claimAccount("a", "tab-b", Date.now() + 16000)).toBe(true);
  expect(await renewAccount("a", "tab-a", Date.now() + 40000)).toBe(false);
  await expect(a.update(e.id, "old tab", e.localGeneration)).rejects.toThrow("locked");
  expect((await a.get(e.id))?.body).toBe("\n\n");
});
it("persistent sign-out lock blocks writes and can be cancelled without data loss", async () => {
  const s = await store(); const e = await s.create({ body: "keep" });
  await setAccountLock("a", "tab-a", true);
  expect(await claimAccount("a", "tab-b", Date.now() + 20000)).toBe(false);
  await expect(s.update(e.id, "blocked", 1)).rejects.toThrow("locked");
  await setAccountLock("a", "tab-a", false);
  expect((await s.get(e.id))?.body).toBe("keep");
});
it("aborted transaction leaves both body and pending unchanged", async () => {
  const s = await store(); const e = await s.create({ body: "before" }); const db = await openFreewriteDB();
  const tx = db.transaction(["entries", "pending"], "readwrite");
  await tx.objectStore("entries").put({ ...e, body: "not committed" }); tx.abort(); await tx.done.catch(() => {});
  expect((await s.get(e.id))?.body).toBe("before");
  expect(await db.get("pending", ["a", e.id])).toMatchObject({ generation: 1 });
});

it("resumes authorized cleanup after interruption, preserving other accounts", async () => {
  const a = await store(); const b = await store("b", "tab-b");
  await a.create({ body: "discard authorized" }); const other = await b.create({ body: "retain" });
  await setAccountLock("a", "tab-a", true, true);
  await closeDatabase(); await resumeAccount("a");
  expect(await a.list()).toEqual([]); expect((await b.get(other.id))?.body).toBe("retain");
  expect(await claimAccount("a", "new-tab")).toBe(true);
});

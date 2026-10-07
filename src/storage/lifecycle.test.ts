import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, expect, it, vi } from "vitest";
import { claimAccount, closeDatabase, createIndexedDBEntryStore, openFreewriteDB } from "./local/indexeddb";
import { createEntryLifecycle } from "./lifecycle";
import { createJournal, fromRemote } from "./sync/journal";
import type { RemoteEntry, RemoteStore } from "./sync/types";

const user = "user", owner = "owner";
beforeEach(async () => { await closeDatabase(); await deleteDB("freewrite"); await claimAccount(user, owner); });
function setup() {
  const remote: RemoteStore = { get: vi.fn(async () => null), body: vi.fn(async () => { throw Error("offline"); }),
    list: vi.fn(async () => ({ rows: [] })), publish: vi.fn(async () => ({ status: "missing" as const })), cleanup: vi.fn(async () => {}) };
  return { lifecycle: createEntryLifecycle(user, owner, remote), local: createIndexedDBEntryStore(user, owner), journal: createJournal(user, owner), remote };
}
async function seed(body: string | null, recovered = false) {
  const id = crypto.randomUUID(), time = new Date().toISOString();
  const row: RemoteEntry = { id, user_id: user, created_at: time, updated_at: time, client_updated_at: time, version: 4,
    preview_text: body ?? "unloaded", word_count: 0, char_count: 0, storage_path: `${user}/${id}/revision.md`, revision_id: "revision",
    body_sha256: null, is_recovered: recovered, conflict_of: null, deleted_at: null };
  const entry = fromRemote(row, body); await (await openFreewriteDB()).put("entries", entry); return { row, entry };
}
it("New Entry reuses the selected blank and creates a different normal entry after writing", async () => {
  const s = setup(); const first = await s.lifecycle.newEntry();
  expect((await s.lifecycle.newEntry(first.id)).id).toBe(first.id);
  await s.local.update(first.id, "writing", first.localGeneration);
  const next = await s.lifecycle.newEntry(first.id); expect(next.id).not.toBe(first.id); expect(next.body).toBe("\n\n");
  expect((await s.local.get(first.id))?.body).toBe("writing");
});
it("restores a recovered copy atomically to a new editable normal entry, preserving the source", async () => {
  const s = setup(); const { entry } = await seed("complete recovered body", true);
  const restored = await s.lifecycle.restore(entry.id, entry.localGeneration);
  expect(restored).toMatchObject({ body: entry.body, recovered: false, baseServerVersion: null, dirty: true });
  expect(restored.id).not.toBe(entry.id); expect(await s.local.get(entry.id)).toEqual(entry);
  await s.local.update(restored.id, "changed restored body", restored.localGeneration);
  expect((await s.local.get(entry.id))?.body).toBe("complete recovered body");
});
it("refuses unavailable, deleted or stale recovery restores", async () => {
  const s = setup(); const { entry } = await seed(null, true);
  await expect(s.lifecycle.restore(entry.id, 1)).rejects.toThrow("unavailable");
  const loaded = await seed("body", true); await expect(s.lifecycle.restore(loaded.entry.id, 0)).rejects.toThrow();
  await s.lifecycle.delete(loaded.entry.id, 1); await expect(s.lifecycle.restore(loaded.entry.id, 1)).rejects.toThrow();
});
it("loads cached entries offline and keeps uncached entries null when download fails", async () => {
  const s = setup(); const cached = await seed("cached"); const absent = await seed(null);
  expect((await s.lifecycle.load(cached.entry.id)).body).toBe("cached"); expect(s.remote.get).not.toHaveBeenCalled();
  s.remote.get = async () => absent.row;
  await expect(s.lifecycle.load(absent.entry.id)).rejects.toThrow("offline");
  expect((await s.local.get(absent.entry.id))?.body).toBeNull();
});
it("an intervening local change is never replaced by a delayed body download", async () => {
  const s = setup(); const { entry, row } = await seed(null); s.remote.get = async () => row;
  s.remote.body = async () => { await (await openFreewriteDB()).put("entries", { ...entry, body: "new local body", dirty: true, localGeneration: 2 }); return "old server body"; };
  expect((await s.lifecycle.load(entry.id)).body).toBe("new local body");
});
it("switch-away cleanup removes only a checked unattempted unpublished blank", async () => {
  const s = setup(); const blank = await s.local.ensureEntry(); const selected = await s.local.create({ body: "keep" });
  expect(await s.lifecycle.cleanupEmpty(blank.id, 1, selected.id)).toBe("removed");
  expect(await s.local.get(blank.id)).toBeNull(); expect(await (await openFreewriteDB()).get("pending", [user, blank.id])).toBeUndefined();
  expect((await s.local.get(selected.id))?.body).toBe("keep");
});
it("cleanup retains the selected/only slot, unloaded bodies, recovered copies and stale observations", async () => {
  const s = setup(); const blank = await s.local.ensureEntry();
  expect(await s.lifecycle.cleanupEmpty(blank.id, 1, blank.id)).toBe("retained");
  expect(await s.lifecycle.cleanupEmpty(blank.id, 1, "missing")).toBe("retained");
  const selected = await s.local.create({ body: "selected" }); const unloaded = await seed(null); const recovered = await seed("\n\n", true);
  expect(await s.lifecycle.cleanupEmpty(unloaded.entry.id, 1, selected.id)).toBe("retained");
  expect(await s.lifecycle.cleanupEmpty(recovered.entry.id, 1, selected.id)).toBe("retained");
  await s.local.update(blank.id, "new text", 1);
  expect(await s.lifecycle.cleanupEmpty(blank.id, 1, selected.id)).toBe("retained"); expect((await s.local.get(blank.id))?.body).toBe("new text");
});
it("published blank cleanup queues a conditional tombstone and never hard-deletes", async () => {
  const s = setup(); const { entry } = await seed("\n\n"); const selected = await s.local.create({ body: "keep" });
  expect(await s.lifecycle.cleanupEmpty(entry.id, 1, selected.id)).toBe("queued");
  const tombstone = (await s.local.get(entry.id))!;
  expect(tombstone).toMatchObject({ deleted: true, dirty: true, deleteVersion: 4 });
  const m = await s.journal.freeze(tombstone); expect(m?.request).toMatchObject({ operation: "delete", expectedVersion: 4 });
});
it("cleanup does not purge a blank with attempted publication or pending edits", async () => {
  const s = setup(); const attempted = await s.local.create({ body: "attempted text" }); const m = await s.journal.freeze(attempted);
  const blank = await s.local.update(attempted.id, "\n\n", 1); const selected = await s.local.create({ body: "keep" });
  expect(await s.lifecycle.cleanupEmpty(blank.id, 2, selected.id)).toBe("retained"); expect(await s.journal.mutations()).toEqual([m]);
  const published = await seed("old body"); await s.local.update(published.entry.id, "\n\n", 1);
  expect(await s.lifecycle.cleanupEmpty(published.entry.id, 2, selected.id)).toBe("retained");
});
it("deleting the original never removes the recovered copy and stale deletion is rejected", async () => {
  const s = setup(); const original = await s.local.create({ body: "original" }); const recovered = await seed("recovered", true);
  await s.local.update(original.id, "newer writing", 1);
  await expect(s.lifecycle.delete(original.id, 1)).rejects.toThrow("Entry changed");
  await s.lifecycle.delete(original.id, 2); expect((await s.local.get(recovered.entry.id))?.body).toBe("recovered");
  expect((await s.lifecycle.list()).map(e => e.id)).toEqual([recovered.entry.id]);
});

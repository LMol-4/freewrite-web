import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { claimAccount, closeDatabase, createIndexedDBEntryStore, openFreewriteDB } from "../local/indexeddb";
import { createJournal, fromRemote } from "./journal";
import { EntrySync, type SyncEvents } from "./engine";
import { digest, RemoteError, type Mutation, type PublicationResult, type RemoteEntry, type RemoteStore } from "./types";

const user = "00000000-0000-4000-8000-000000000001";
let engines: EntrySync[] = [];
beforeEach(async () => { await closeDatabase(); await deleteDB("freewrite"); await claimAccount(user, "writer"); });
afterEach(() => { for (const engine of engines) engine.stop(); engines = []; vi.useRealTimers(); });
function row(m: Mutation, version = 1): RemoteEntry {
  const p = m.request;
  return { id: p.id, user_id: user, version, created_at: p.createdAt, updated_at: p.updatedAt, client_updated_at: p.updatedAt,
    preview_text: p.preview, char_count: p.charCount, word_count: p.wordCount, storage_path: p.path, revision_id: p.revisionId,
    body_sha256: p.sha256, is_recovered: p.recovered, conflict_of: p.conflictOf, deleted_at: p.operation === "delete" ? new Date().toISOString() : null };
}
function setup() {
  const journal = createJournal(user, "writer"); const local = createIndexedDBEntryStore(user, "writer");
  const rows = new Map<string, RemoteEntry>(); const bodies = new Map<string, string>();
  const receipts = new Map<string, PublicationResult>();
  let selected: string | undefined;
  const remote: RemoteStore = {
    list: vi.fn(async () => ({ rows: [...rows.values()] })), get: vi.fn(async id => rows.get(id) ?? null),
    body: vi.fn(async entry => { const body = bodies.get(entry.storage_path); if (body === undefined) throw Error("missing body"); return body; }),
    publish: vi.fn(async m => {
      const receipt = receipts.get(m.mutationId); if (receipt) return receipt;
      const current = rows.get(m.entryId); let result: PublicationResult;
      if (current?.deleted_at) result = { status: "deleted", entry: current };
      else if (m.request.operation === "create" ? !!current : current?.version !== m.request.expectedVersion) result = { status: "conflict", entry: current };
      else {
        const next = row(m, (current?.version ?? 0) + 1);
        if (m.request.operation === "delete" && current) { next.storage_path = current.storage_path; next.revision_id = current.revision_id; next.body_sha256 = current.body_sha256; }
        rows.set(next.id, next); if (m.request.operation !== "delete") bodies.set(next.storage_path, m.body!);
        result = { status: "ok", entry: next };
      }
      receipts.set(m.mutationId, result); return result;
    }), cleanup: vi.fn(async task => { bodies.delete(task.path); }),
  };
  const events: SyncEvents = { active: () => true, selected: () => selected, changed: vi.fn(async () => {}), quiesce: vi.fn(async () => {}), resume: vi.fn(), status: vi.fn(), notice: vi.fn() };
  const engine = new EntrySync(journal, remote, events, Date.now, () => 0); engines.push(engine);
  return { journal, local, rows, bodies, receipts, remote, events, engine, select: (id: string) => { selected = id; } };
}
it("freezes exact bytes and IDs across reload while later edits remain a successor", async () => {
  const { local, journal } = setup(); const entry = await local.create({ body: "one" });
  const first = (await journal.freeze(entry))!;
  const next = await local.update(entry.id, "two", 1); await closeDatabase();
  expect(await journal.freeze(next)).toEqual(first);
  expect(first.request.sha256).toBe(await digest("one"));
  await journal.acknowledge(first, row(first));
  expect(await local.get(entry.id)).toMatchObject({ body: "two", dirty: true, baseServerVersion: 1, localGeneration: 2 });
  const successor = (await journal.freeze((await local.get(entry.id))!))!;
  expect(successor.body).toBe("two"); expect(successor.request.expectedVersion).toBe(1); expect(successor.mutationId).not.toBe(first.mutationId);
});
it("does not advance a dirty base version during focus reconciliation", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  await s.local.update(e.id, "local dirty", 1);
  const remote = s.rows.get(e.id)!; s.rows.set(e.id, { ...remote, version: 2, storage_path: "winner" }); s.bodies.set("winner", "other device");
  const publish = s.remote.publish;
  s.remote.publish = vi.fn(async m => { if (m.entryId === e.id) expect(m.request.expectedVersion).toBe(1); return publish(m); });
  s.select(e.id); await s.engine.flush(true);
  expect((await s.local.get(e.id))?.body).toBe("other device");
  const recovered = (await s.journal.entries()).filter(e => e.recovered);
  expect(recovered).toHaveLength(1); expect(recovered[0]).toMatchObject({ body: "local dirty", dirty: false });
  expect(s.events.notice).toHaveBeenCalledWith("This entry changed on another device. Your version was saved separately.");
});
it("includes edits committed during a conflicting request and publishes one recovery", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  await s.local.update(e.id, "first losing snapshot", 1);
  const remote = s.rows.get(e.id)!; s.rows.set(e.id, { ...remote, version: 2 });
  const publish = s.remote.publish; let injected = false;
  s.remote.publish = async m => { if (!injected) { injected = true; await s.local.update(e.id, "latest complete losing text", 2); } return publish(m); };
  await s.engine.flush(); await s.engine.flush();
  expect((await s.journal.entries()).filter(e => e.recovered).map(e => e.body)).toEqual(["latest complete losing text"]);
  expect([...s.rows.values()].filter(e => e.is_recovered)).toHaveLength(1);
});
it("replays a lost committed response after another device edits without a false conflict", async () => {
  const s = setup(); const e = await s.local.create({ body: "mine" }); const publish = s.remote.publish; let lost = true;
  s.remote.publish = async m => { const result = await publish(m); if (lost) { lost = false; throw Error("response lost"); } return result; };
  await expect(s.engine.flush()).rejects.toThrow("response lost");
  const frozen = (await s.journal.mutations())[0]; const current = s.rows.get(e.id)!;
  s.rows.set(e.id, { ...current, version: 2, storage_path: "later" }); s.bodies.set("later", "later remote body"); s.select(e.id);
  await s.engine.flush(false, true);
  expect((await s.local.get(e.id))?.body).toBe("later remote body");
  expect(s.receipts.size).toBe(1); expect(s.receipts.has(frozen.mutationId)).toBe(true);
  expect((await s.journal.entries()).some(e => e.recovered)).toBe(false);
});
it("retains the original and losing body if canonical download fails", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  await s.local.update(e.id, "losing text", 1); const old = s.rows.get(e.id)!;
  s.rows.set(e.id, { ...old, version: 2, storage_path: "missing" });
  await expect(s.engine.flush()).rejects.toThrow("missing body");
  expect((await s.local.get(e.id))?.body).toBe("losing text"); expect(await s.journal.mutations()).toHaveLength(1);
  expect(s.events.notice).not.toHaveBeenCalled();
});
it("one failed entry does not block unrelated publication", async () => {
  const s = setup(); const a = await s.local.create({ body: "failed" }); const b = await s.local.create({ body: "success" });
  const publish = s.remote.publish; s.remote.publish = async m => { if (m.entryId === a.id) throw Error("offline"); return publish(m); };
  await expect(s.engine.flush()).rejects.toThrow("offline");
  expect(s.rows.has(b.id)).toBe(true); expect((await s.local.get(a.id))?.dirty).toBe(true);
});
it("metadata absence, short pages and partial failures never erase local text", async () => {
  const s = setup(); const a = await s.local.create({ body: "retained" }); await s.engine.flush();
  s.rows.delete(a.id); s.remote.list = async () => ({ rows: [] });
  await s.engine.flush(true); expect((await s.local.get(a.id))?.body).toBe("retained");
  s.remote.list = async () => { throw Error("partial listing"); };
  await expect(s.engine.flush(true)).rejects.toThrow("partial listing"); expect((await s.local.get(a.id))?.body).toBe("retained");
});
it("paged metadata includes tied timestamps, keeps uncached bodies null and downloads only selection", async () => {
  const s = setup(); const a = await s.local.create({ body: "first" }); const b = await s.local.create({ body: "second" }); await s.engine.flush();
  const rows = [...s.rows.values()].map(r => ({ ...r, created_at: a.createdAt }));
  const db = await openFreewriteDB(); await db.clear("entries");
  s.remote.list = vi.fn(async cursor => !cursor ? { rows: [rows[0]], next: { createdAt: rows[0].created_at, id: rows[0].id } } : { rows: [rows[1]] });
  s.select(a.id); await s.engine.flush(true);
  expect((await s.local.get(a.id))?.body).toBe("first"); expect((await s.local.get(b.id))?.body).toBeNull();
  expect(s.remote.body).toHaveBeenCalledTimes(1);
});
it("a clean download cannot overwrite an edit made while it was pending", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  const r = s.rows.get(e.id)!; s.rows.set(e.id, { ...r, version: 2, storage_path: "new" });
  s.select(e.id); s.remote.body = async () => { await s.local.update(e.id, "typed during fetch", 1); throw Error("download interrupted"); };
  s.remote.publish = async () => { throw Error("network down"); };
  await expect(s.engine.flush(true)).rejects.toThrow();
  expect(await s.local.get(e.id)).toMatchObject({ body: "typed during fetch", baseServerVersion: 1, dirty: true });
});
it("stale deletes retain newer remote writing and require another decision", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  await s.journal.delete(e.id, 1); const r = s.rows.get(e.id)!;
  s.rows.set(e.id, { ...r, version: 2, storage_path: "new" }); s.bodies.set("new", "newer text");
  await s.engine.flush();
  expect(await s.local.get(e.id)).toMatchObject({ body: "newer text", deleted: false, dirty: false, baseServerVersion: 2 });
  expect(s.rows.get(e.id)?.deleted_at).toBeNull(); expect(s.events.notice).toHaveBeenCalledWith(expect.stringContaining("before deleting again"));
});
it("dirty edits encountering a tombstone recover under a new ID without resurrection", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush(); await s.local.update(e.id, "offline edits", 1);
  s.rows.set(e.id, { ...s.rows.get(e.id)!, version: 2, deleted_at: new Date().toISOString() }); await s.engine.flush();
  expect(s.rows.get(e.id)?.deleted_at).not.toBeNull();
  expect((await s.journal.entries()).filter(e => e.recovered).map(e => e.body)).toEqual(["offline edits"]);
});
it("lost delete acknowledgement replays and failed cleanup remains durable", async () => {
  const s = setup(); const e = await s.local.create({ body: "delete me" }); await s.engine.flush(); await s.journal.delete(e.id, 1);
  const publish = s.remote.publish; let lost = true;
  s.remote.publish = async m => { const result = await publish(m); if (lost) { lost = false; throw Error("lost delete"); } return result; };
  await expect(s.engine.flush()).rejects.toThrow("lost delete");
  s.remote.cleanup = async () => { throw Error("removal failed"); };
  await expect(s.engine.flush(false, true)).rejects.toThrow("removal failed");
  expect(await s.journal.mutations()).toHaveLength(0); expect(await s.journal.cleanups()).toHaveLength(1);
  s.remote.cleanup = async () => {}; await s.engine.flush(); expect(await s.journal.hasPending()).toBe(false);
});
it("deletion resolves an ambiguous create before its conditional tombstone", async () => {
  const s = setup(); const e = await s.local.create({ body: "create" }); const m = (await s.journal.freeze(e))!;
  await s.remote.publish(m); await s.journal.delete(e.id, 1); await s.engine.flush();
  expect(s.rows.get(e.id)).toMatchObject({ version: 2, deleted_at: expect.any(String) }); expect(await s.journal.hasPending()).toBe(false);
});
it("unattempted unpublished creates cancel without network deletion", async () => {
  const s = setup(); const e = await s.local.create({ body: "cancel" }); await s.journal.delete(e.id, 1); await s.engine.flush();
  expect(await s.local.get(e.id)).toBeNull(); expect(s.remote.publish).not.toHaveBeenCalled();
});
it("fences late acknowledgements after coordinator takeover", async () => {
  const s = setup(); const e = await s.local.create({ body: "retained" }); const m = (await s.journal.freeze(e))!;
  await claimAccount(user, "new-owner", Date.now() + 20000);
  await expect(s.journal.acknowledge(m, row(m))).rejects.toThrow("locked"); expect(await s.journal.mutations()).toHaveLength(1);
});
it("auth failures pause automatic retries and preserve pending work", async () => {
  const s = setup(); await s.local.create({ body: "retained" }); s.remote.publish = vi.fn(async () => { throw new RemoteError("expired", "auth"); });
  await expect(s.engine.flush()).rejects.toThrow("expired"); await expect(s.engine.flush()).rejects.toThrow("Sign in");
  expect(s.remote.publish).toHaveBeenCalledTimes(1); expect(await s.journal.hasPending()).toBe(true);
});
it("session invalidation rejects a late remote result", async () => {
  const s = setup(); const e = await s.local.create({ body: "account A" }); const publish = s.remote.publish;
  s.remote.publish = async m => { const result = await publish(m); s.events.active = () => false; return result; };
  await expect(s.engine.flush()).rejects.toThrow("Session changed"); expect((await s.local.get(e.id))?.dirty).toBe(true);
});
it("recovery classification survives parent tombstones and recovered bodies are read-only", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush(); const r = s.rows.get(e.id)!;
  const recovered = { ...r, id: crypto.randomUUID(), is_recovered: true, conflict_of: e.id };
  const db = await openFreewriteDB(); await db.put("entries", fromRemote(recovered, "recovery"));
  await s.journal.delete(e.id, 1); await s.engine.flush();
  expect(await s.local.get(recovered.id)).toMatchObject({ body: "recovery", recovered: true });
  await expect(s.local.update(recovered.id, "overwrite", 1)).rejects.toThrow("not editable");
});
it("debounces idle sends but bounds continuous editing at fifteen seconds", async () => {
  const s = setup(); vi.useFakeTimers(); const flush = vi.spyOn(s.engine, "flush").mockResolvedValue();
  for (let second = 0; second < 15; second++) { s.engine.schedule(); await vi.advanceTimersByTimeAsync(1000); }
  expect(flush).toHaveBeenCalledTimes(1);
});
it("persists exponential retry timing and does not retry early", async () => {
  const s = setup(); await s.local.create({ body: "pending" }); s.remote.publish = vi.fn(async () => { throw Error("transient"); });
  const start = Date.now(); await expect(s.engine.flush()).rejects.toThrow();
  const m = (await s.journal.mutations())[0]; expect(m.attempts).toBe(1); expect(m.retryAt).toBeGreaterThanOrEqual(start + 800);
  await expect(s.engine.flush()).rejects.toThrow("transient"); expect(s.remote.publish).toHaveBeenCalledTimes(1);
  await expect(s.engine.flush(false, true)).rejects.toThrow(); expect((await s.journal.mutations())[0].attempts).toBe(2);
});
it("permission failures require explicit retry instead of repeatedly publishing", async () => {
  const s = setup(); await s.local.create({ body: "pending" }); s.remote.publish = vi.fn(async () => { throw new RemoteError("permission denied", "permission"); });
  await expect(s.engine.flush()).rejects.toThrow("permission denied");
  expect((await s.journal.mutations())[0].retryAt).toBe(Number.MAX_SAFE_INTEGER);
  await expect(s.engine.flush()).rejects.toThrow("permission denied"); expect(s.remote.publish).toHaveBeenCalledTimes(1);
});
it("sign-out quiescence cancels background scheduling while permitting an explicit flush", async () => {
  const s = setup(); vi.useFakeTimers(); const flush = vi.spyOn(s.engine, "flush").mockResolvedValue();
  s.engine.schedule(); s.engine.pauseScheduling(); s.engine.schedule();
  await vi.advanceTimersByTimeAsync(20000); expect(flush).not.toHaveBeenCalled();
  await s.engine.flush(); expect(flush).toHaveBeenCalledTimes(1);
});
it("a losing blank edit is recovered remotely rather than mistaken for an unused scratch slot", async () => {
  const s = setup(); const e = await s.local.create({ body: "base" }); await s.engine.flush();
  await s.local.update(e.id, "\n\n", 1); s.rows.set(e.id, { ...s.rows.get(e.id)!, version: 2 });
  await s.engine.flush(); const recovery = [...s.rows.values()].find(r => r.is_recovered);
  expect(recovery).toBeDefined(); expect(s.bodies.get(recovery!.storage_path)).toBe("\n\n");
});

import { test, expect, localClients } from "./fixtures";
import { createRemoteEntryStore } from "../src/storage/remote/entries";
import { digest, type Mutation } from "../src/storage/sync/types";
import type { Json } from "../src/lib/supabase/database.types";
async function mutation(userId: string, body = "complete body"): Promise<Mutation> {
  const id = crypto.randomUUID(), revisionId = crypto.randomUUID(), date = new Date().toISOString();
  return { userId, entryId: id, mutationId: crypto.randomUUID(), body, generation: 1, attempts: 0, retryAt: 0,
    request: { id, operation: "create", expectedVersion: null, revisionId, path: `${userId}/${id}/${revisionId}.md`,
      sha256: await digest(body), createdAt: date, updatedAt: date, preview: body.slice(0, 30), wordCount: 2, charCount: body.length, recovered: false, conflictOf: null } };
}
test("publication receipts serialize duplicate retries; later edits cannot change the receipt", async ({ account }) => {
  const client = localClients().user(); await client.auth.signInWithPassword(account);
  const store = createRemoteEntryStore(client, account.id); const m = await mutation(account.id);
  const [a, b] = await Promise.all([store.publish(m), store.publish(m)]);
  expect(a).toEqual(b); expect(a.entry?.version).toBe(1);
  const next = await mutation(account.id, "second complete body"); next.entryId = m.entryId;
  next.request = { ...next.request, id: m.entryId, operation: "update", expectedVersion: 1, createdAt: m.request.createdAt, path: `${account.id}/${m.entryId}/${next.request.revisionId}.md` };
  expect((await store.publish(next)).entry?.version).toBe(2);
  expect(await store.publish(m)).toEqual(a);
  expect(await store.body((await store.get(m.entryId))!)).toBe("second complete body");
  const changed = await client.rpc("publish_entry", { p_mutation_id: m.mutationId, p_request: { ...m.request, preview: "forged retry" } as Json });
  expect(changed.error?.message).toContain("mutation_mismatch");
});
test("CAS contenders preserve both immutable uploads and only one canonical pointer", async ({ account }) => {
  const client = localClients().user(); await client.auth.signInWithPassword(account); const store = createRemoteEntryStore(client, account.id);
  const first = await mutation(account.id); await store.publish(first);
  const contenders = await Promise.all([mutation(account.id, "device A text"), mutation(account.id, "device B text")]);
  for (const m of contenders) { m.entryId = first.entryId; m.request = { ...m.request, id: first.entryId, operation: "update", expectedVersion: 1, createdAt: first.request.createdAt, path: `${account.id}/${first.entryId}/${m.request.revisionId}.md` }; }
  const results = await Promise.all(contenders.map(m => store.publish(m)));
  expect(results.map(r => r.status).sort()).toEqual(["conflict", "ok"]);
  const winner = contenders[results.findIndex(r => r.status === "ok")];
  expect(await store.body((await store.get(first.entryId))!)).toBe(winner.body);
  for (const m of contenders) expect(await (await client.storage.from("notes").download(m.request.path)).data?.text()).toBe(m.body);
});
test("RLS, grants and publication validation reject bypasses and foreign parents/paths", async ({ account, createAccount }) => {
  const other = await createAccount(); const { user } = localClients(); const a = user(), b = user(), anon = user();
  await a.auth.signInWithPassword(account); await b.auth.signInWithPassword(other);
  const store = createRemoteEntryStore(a, account.id); const m = await mutation(account.id); await store.publish(m);
  expect((await a.from("entries").update({ version: 99 }).eq("id", m.entryId)).error).not.toBeNull();
  expect((await a.from("entries").delete().eq("id", m.entryId)).error).not.toBeNull();
  expect((await a.from("entries").insert({ id: crypto.randomUUID(), user_id: account.id, storage_path: "bad" })).error).not.toBeNull();
  expect((await b.from("entry_receipts").select("*").eq("mutation_id", m.mutationId)).data).toEqual([]);
  expect((await anon.from("entry_receipts").select("*")).error).not.toBeNull();
  expect((await anon.rpc("publish_entry", { p_mutation_id: crypto.randomUUID(), p_request: { ...m.request } as Json })).error).not.toBeNull();
  const foreign = await mutation(other.id); foreign.request.recovered = true; foreign.request.conflictOf = m.entryId;
  expect((await b.rpc("publish_entry", { p_mutation_id: foreign.mutationId, p_request: { ...foreign.request } as Json })).error?.message).toContain("invalid_recovery_parent");
  foreign.request.conflictOf = null; foreign.request.path = m.request.path;
  expect((await b.rpc("publish_entry", { p_mutation_id: crypto.randomUUID(), p_request: { ...foreign.request } as Json })).error?.message).toContain("invalid_revision");
  expect((await a.storage.from("notes").update(m.request.path, "overwrite")).error).not.toBeNull();
  expect((await b.storage.from("notes").download(m.request.path)).error).not.toBeNull();
});
test("duplicate upload verifies exact bytes; corrupt and missing bodies never become blank notes", async ({ account }) => {
  const client = localClients().user(); await client.auth.signInWithPassword(account); const store = createRemoteEntryStore(client, account.id);
  const m = await mutation(account.id); await client.storage.from("notes").upload(m.request.path, m.body!);
  expect((await store.publish(m)).status).toBe("ok");
  const corrupt = await mutation(account.id); await client.storage.from("notes").upload(corrupt.request.path, "wrong bytes");
  await expect(store.publish(corrupt)).rejects.toThrow("integrity");
  expect(await store.get(corrupt.entryId)).toBeNull();
  await client.storage.from("notes").remove([m.request.path]);
  await expect(store.body((await store.get(m.entryId))!)).rejects.toThrow();
  expect((await store.publish(m)).status).toBe("ok"); // receipt replay does not re-upload removed objects
});
test("tombstones prevent resurrection; cleanup removes original revisions but preserves recovery", async ({ account }) => {
  const client = localClients().user(); await client.auth.signInWithPassword(account); const store = createRemoteEntryStore(client, account.id);
  const original = await mutation(account.id); await store.publish(original);
  const recovery = await mutation(account.id, "recovered text"); recovery.request.recovered = true; recovery.request.conflictOf = original.entryId; await store.publish(recovery);
  const del: Mutation = { ...original, mutationId: crypto.randomUUID(), request: { ...original.request, operation: "delete", expectedVersion: 1 } };
  const deleted = await store.publish(del); expect(deleted.entry?.version).toBe(2);
  await store.cleanup({ userId: account.id, entryId: original.entryId, path: original.request.path, wholeEntry: true });
  expect(await store.publish(del)).toEqual(deleted);
  expect((await store.publish({ ...original, mutationId: crypto.randomUUID(), request: { ...original.request, operation: "update", expectedVersion: 2 } })).status).toBe("deleted");
  expect(await store.body((await store.get(recovery.entryId))!)).toBe("recovered text");
});
test("keyset pagination traverses more than two pages with identical timestamps", async ({ account }) => {
  const { admin, user } = localClients(); const client = user(); await client.auth.signInWithPassword(account);
  const created_at = "2026-01-01T00:00:00.000Z";
  const seed = Array.from({ length: 205 }, () => { const id = crypto.randomUUID(); return { id, user_id: account.id, created_at, storage_path: `${account.id}/${id}.md` }; });
  expect((await admin.from("entries").insert(seed)).error).toBeNull();
  const store = createRemoteEntryStore(client, account.id); const ids: string[] = []; let cursor;
  do { const page = await store.list(cursor); ids.push(...page.rows.map(r => r.id)); cursor = page.next; } while (cursor);
  expect(ids).toEqual(seed.map(r => r.id).sort().reverse()); expect(new Set(ids).size).toBe(205);
});

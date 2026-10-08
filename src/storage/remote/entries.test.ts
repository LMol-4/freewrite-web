import { createClient, type User } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createRemoteEntryStore } from "./entries";
import { digest, type Mutation } from "../sync/types";

async function fixture() {
  const userId = crypto.randomUUID(), id = crypto.randomUUID(), revisionId = crypto.randomUUID();
  const body = "Complete writing 🌍";
  const date = new Date().toISOString();
  const mutation: Mutation = { userId, entryId: id, mutationId: crypto.randomUUID(), body, generation: 1, attempts: 0, retryAt: 0,
    request: { id, operation: "create", expectedVersion: null, revisionId, path: `${userId}/${id}/${revisionId}.md`,
      sha256: await digest(body), createdAt: date, updatedAt: date, preview: body, wordCount: 3, charCount: body.length, recovered: false, conflictOf: null } };
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  let failPublish = true, failUpload = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/entry_receipts")) return response([]);
    if (url.includes("/rest/v1/rpc/publish_entry")) return failPublish ? response({ message: "Publication unavailable" }, 500) : response({ status: "ok", entry: { user_id: userId } });
    if (url.includes("/storage/v1/object/notes/") && init?.method === "POST") return failUpload ? response({ message: "Upload unavailable" }, 500) : response({ Key: mutation.request.path });
    throw Error(`Unexpected test request: ${url}`);
  });
  const client = createClient("http://127.0.0.1:55321", "unit-test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: { id: userId } as User }, error: null });
  return { mutation, store: createRemoteEntryStore(client, userId), fetch,
    uploads: () => fetch.mock.calls.filter(([url, init]) => String(url).includes("/storage/") && init?.method === "POST").length,
    recover: () => { failPublish = false; failUpload = false; }, failUpload: () => { failUpload = true; } };
}

it("retries publication without resending an acknowledged immutable upload", async () => {
  const s = await fixture();
  await expect(s.store.publish(s.mutation)).rejects.toThrow("Publication unavailable");
  s.recover();
  expect((await s.store.publish(s.mutation)).status).toBe("ok");
  expect(s.uploads()).toBe(1);
  const receipts = s.fetch.mock.calls.filter(([url]) => String(url).includes("/entry_receipts"));
  expect(receipts).toHaveLength(2);
  expect(new URL(String(receipts[0][0])).searchParams.get("select")).toBe("mutation_id");
});

it("never treats an unacknowledged upload as uploaded", async () => {
  const s = await fixture(); s.failUpload();
  await expect(s.store.publish(s.mutation)).rejects.toThrow("Upload unavailable");
  s.recover();
  await s.store.publish(s.mutation);
  expect(s.uploads()).toBe(2);
});

it("still validates the frozen body on a publication retry", async () => {
  const s = await fixture();
  await expect(s.store.publish(s.mutation)).rejects.toThrow("Publication unavailable");
  s.recover();
  await expect(s.store.publish({ ...s.mutation, body: "corrupted bytes" })).rejects.toThrow("digest");
  expect(s.uploads()).toBe(1);
});

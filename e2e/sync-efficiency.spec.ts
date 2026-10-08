import { test, expect, localClients, syncNow } from "./fixtures";
import { createRemoteEntryStore } from "../src/storage/remote/entries";

test("publication retry does not transfer the same acknowledged upload again", async ({ page, account }) => {
  await expect(page.locator(".sync-status")).toHaveAttribute("data-state", "synced");
  let uploads = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/storage/v1/object/notes/")) uploads++; });
  await page.route("**/rest/v1/rpc/publish_entry", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Temporary publication failure" }) }));
  const body = "Retain the acknowledged upload while retrying publication. 🌍";
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill(body);
  await syncNow(page);
  await expect(page.locator(".sync-status")).toHaveAttribute("data-state", "attention");
  await page.unroute("**/rest/v1/rpc/publish_entry");
  await syncNow(page);
  await expect(page.locator(".sync-status")).toHaveAttribute("data-state", "synced");
  expect(uploads).toBe(1);
  const client = localClients().user(); await client.auth.signInWithPassword(account);
  const remote = createRemoteEntryStore(client, account.id);
  const rows = await remote.list(); expect(rows.rows).toHaveLength(1);
  expect(await remote.body(rows.rows[0])).toBe(body);
});

test("an identical remote revision keeps verified local text without a body download", async ({ page, account }) => {
  const body = "The same complete body on both devices. 🌍";
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill(body);
  await syncNow(page);
  await expect(page.locator(".sync-status")).toHaveAttribute("data-state", "synced");
  const client = localClients().user(); await client.auth.signInWithPassword(account);
  const remote = createRemoteEntryStore(client, account.id);
  const row = (await remote.list()).rows[0];
  const revisionId = crypto.randomUUID();
  const result = await remote.publish({ userId: account.id, entryId: row.id, mutationId: crypto.randomUUID(), generation: 1, attempts: 0, retryAt: 0, body,
    request: { id: row.id, operation: "update", expectedVersion: row.version, revisionId, path: `${account.id}/${row.id}/${revisionId}.md`,
      sha256: row.body_sha256, createdAt: row.created_at, updatedAt: new Date().toISOString(), preview: row.preview_text,
      wordCount: row.word_count, charCount: row.char_count, recovered: false, conflictOf: null } });
  expect(result.status).toBe("ok");
  let downloads = 0;
  page.on("request", request => { if (request.method() === "GET" && request.url().includes("/storage/v1/object/")) downloads++; });
  await syncNow(page);
  await expect.poll(() => page.evaluate(({ userId, id }) => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("freewrite");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("entries");
      const get = tx.objectStore("entries").get([userId, id]);
      get.onsuccess = () => resolve(get.result?.baseServerVersion);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }), { userId: account.id, id: row.id })).toBe(result.entry!.version);
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue(body);
  expect(downloads).toBe(0);
});

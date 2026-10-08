import { test, expect, localClients, type Account } from "./fixtures";
import { createHash, randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

const origin = "http://127.0.0.1:3000";
async function key(request: APIRequestContext) {
  const generated = await request.post("/api/mcp-key", { headers: { Origin: origin }, data: { action: "ensure" } });
  expect(generated.status()).toBe(200);
  const revealed = await request.post("/api/mcp-key", { headers: { Origin: origin }, data: { action: "reveal" } });
  return (await revealed.json()).credential as { generation: string; key: string };
}
async function rpc(request: APIRequestContext, token: string, name: string, args: unknown = {}) {
  return request.post("/mcp", { headers: { Authorization: "Bearer " + token, Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
}
async function seed(account: Account, body: string, extra = {}) {
  const { admin } = localClients(); const id = randomUUID(); const revision = randomUUID();
  const path = account.id + "/" + id + "/" + revision + ".md";
  const uploaded = await admin.storage.from("notes").upload(path, body, { contentType: "text/markdown" });
  expect(uploaded.error).toBeNull();
  const inserted = await admin.from("entries").insert({ id, user_id: account.id, storage_path: path, revision_id: revision,
    body_sha256: createHash("sha256").update(body).digest("hex"), preview_text: body.slice(0, 30), word_count: 3, char_count: body.length, ...extra });
  expect(inserted.error).toBeNull();
  return id;
}

test("connector reveals the same key across visits and rotates it", async ({ page }) => {
  await page.getByRole("button", { name: "MCP connector", exact: true }).click();
  await expect(page.getByRole("heading", { name: "MCP connector", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate key", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Generate API key" })).toHaveCount(0);
  const field = page.getByRole("textbox", { name: "API key", exact: true });
  await page.getByRole("button", { name: "Reveal API key" }).click();
  await expect(field).toHaveValue(/^fw_/);
  const first = await field.inputValue();
  expect(first).toMatch(/^fw_/);
  await page.reload();
  await expect(page.locator('input[aria-label="API key"]')).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Reveal API key" }).click();
  await expect(field).toHaveValue(first);
  await page.getByRole("button", { name: "Hide API key" }).click();
  await page.getByRole("button", { name: "Rotate key", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rotate key", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await rpc(page.request, first, "list_notes")).status()).toBe(401);
  await page.getByRole("button", { name: "Reveal API key" }).click();
  await expect(field).toHaveValue(/^fw_/);
  expect(await field.inputValue()).not.toBe(first);
  await page.getByText("Manual setup", { exact: true }).click();
  await expect(page.locator("dd").first()).toHaveText(origin + "/mcp");
  await page.getByRole("button", { name: "Hide API key" }).click();
  await page.screenshot({ path: ".local-test/mcp-connector-light.png", fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.screenshot({ path: ".local-test/mcp-connector-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local-test/mcp-connector-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("MCP enforces ownership, deletion, readonly credentials, and full-note continuation", async ({ page, account, createAccount }) => {
  const other = await createAccount();
  const body = "first sentence. " + "😀".repeat(13000);
  const own = await seed(account, body);
  const foreign = await seed(other, "private foreign note");
  const deleted = await seed(account, "deleted note", { deleted_at: new Date().toISOString() });
  const recovered = await seed(account, "recovered note", { is_recovered: true });
  const credential = await key(page.request);
  let cursor: string | null = null; const listed = [];
  do {
    const response = await rpc(page.request, credential.key, "list_notes", { limit: 1, ...(cursor ? { cursor } : {}) });
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store");
    const value = (await response.json()).result.structuredContent; listed.push(...value.notes); cursor = value.next_cursor;
  } while (cursor);
  expect(listed.map(n => n.id)).toContain(own); expect(listed.map(n => n.id)).not.toContain(foreign);
  expect(listed.map(n => n.id)).not.toContain(deleted); expect(listed.find(n => n.id === recovered).recovered).toBe(true);
  let text = ""; cursor = null;
  do {
    const response = await rpc(page.request, credential.key, "get_notes", { ids: [own], ...(cursor ? { cursor } : {}) });
    const note = (await response.json()).result.structuredContent.notes[0]; text += note.content; cursor = note.next_cursor;
  } while (cursor);
  expect(text).toBe(body);
  const unavailable = await rpc(page.request, credential.key, "get_notes", { ids: [foreign, deleted] });
  expect((await unavailable.json()).result.structuredContent.notes.map((n: { error: string }) => n.error)).toEqual(["not_found", "not_found"]);
  expect((await (await rpc(page.request, credential.key, "delete_note", { ids: [own] })).json()).result.isError).toBe(true);
  const direct = await page.request.post(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/publish_entry", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: "Bearer " + credential.key },
    data: { p_mutation_id: randomUUID(), p_request: { operation: "delete", id: own, expectedVersion: 1 } },
  });
  expect(direct.ok()).toBe(false);
  const { admin, user } = localClients();
  const browserUser = user(); await browserUser.auth.signInWithPassword({ email: account.email, password: account.password });
  expect((await browserUser.from("mcp_keys").select("*")).error).not.toBeNull();
  const note = await admin.from("entries").select("deleted_at,version").eq("id", own).single();
  expect(note.data).toMatchObject({ deleted_at: null, version: 1 });
});

test("key initialization and rotation are atomic and management rejects foreign origins", async ({ page }) => {
  const ensure = () => page.request.post("/api/mcp-key", { headers: { Origin: origin }, data: { action: "ensure" } });
  const initialized = await Promise.all([ensure(), ensure()]);
  const metadata = await Promise.all(initialized.map(async response => {
    expect(response.status()).toBe(200);
    return (await response.json()).credential;
  }));
  expect(metadata[0].generation).toBe(metadata[1].generation);
  expect(metadata[0].key).toBeUndefined();
  const credential = await key(page.request);
  expect(credential.generation).toBe(metadata[0].generation);
  const rotate = () => page.request.post("/api/mcp-key", { headers: { Origin: origin }, data: { action: "replace", generation: credential.generation } });
  const responses = await Promise.all([rotate(), rotate()]);
  expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
  expect((await rpc(page.request, credential.key, "list_notes")).status()).toBe(401);
  const blocked = await page.request.post("/api/mcp-key", { headers: { Origin: "https://evil.test" }, data: { action: "reveal" } });
  expect(blocked.status()).toBe(403);
});

test("connector can retry a failed automatic key load", async ({ page }) => {
  await page.route("**/api/mcp-key", async route => {
    await route.fulfill({ status: 503, json: { error: "The MCP connector needs a database update. Please contact the site owner." } });
  });
  await page.goto("/connect");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("needs a database update");
  await page.unroute("**/api/mcp-key");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rotate key", exact: true })).toBeEnabled();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("public instructions use configured origin and never expose credentials", async ({ page, browser }) => {
  const credential = await key(page.request);
  const context = await browser.newContext();
  try {
    const docs = await context.request.get(origin + "/docs/mcp-setup.md");
    expect(docs.headers()["content-type"]).toContain("text/markdown");
    const body = await docs.text();
    expect(body).toContain(origin + "/mcp"); expect(body).not.toContain("{{APP_ORIGIN}}"); expect(body).not.toContain(credential.key);
    expect((await context.request.get(origin + "/api/mcp-key")).status()).toBe(401);
    const fresh = await context.newPage(); await fresh.goto(origin + "/connect");
    await expect(fresh).toHaveURL(/sign-in/);
  } finally { await context.close(); }
});

test("copy actions keep the key out of the setup prompt and support manual fallback", async ({ page }) => {
  await key(page.request);
  await page.goto("/connect");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } },
  }));
  await page.getByRole("button", { name: "Copy key", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Key copied.");
  const copiedKey = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copiedKey).toMatch(/^fw_/);
  await expect(page.locator('input[aria-label="API key"]')).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Copy setup prompt" }).click();
  await expect(page.getByRole("status")).toContainText("Setup prompt copied.");
  const prompt = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(prompt).toContain(origin + "/docs/mcp-setup.md"); expect(prompt).not.toContain(copiedKey);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async () => { throw Error("denied"); } },
  }));
  await page.getByRole("button", { name: "Copy setup prompt" }).click();
  await expect(page.getByLabel("Select and copy the setup prompt")).toHaveValue(prompt);
});

test("key storage is encrypted and rate limits are shared across requests", async ({ page, account }) => {
  const credential = await key(page.request);
  const { admin, user } = localClients();
  const stored = await admin.from("mcp_keys").select("*").eq("user_id", account.id).single();
  expect(stored.error).toBeNull(); expect(stored.data!.ciphertext).not.toContain(credential.key);
  expect(stored.data!.key_hash).toBe(createHash("sha256").update(credential.key).digest("hex"));
  const browserUser = user(); await browserUser.auth.signInWithPassword({ email: account.email, password: account.password });
  const forbidden = await browserUser.rpc("authenticate_mcp_key", { p_hash: stored.data!.key_hash });
  expect(forbidden.error).not.toBeNull();
  const update = await admin.from("mcp_keys").update({ request_count: 120, window_started_at: new Date().toISOString() }).eq("user_id", account.id);
  expect(update.error).toBeNull();
  const limited = await rpc(page.request, credential.key, "list_notes");
  expect(limited.status()).toBe(429); expect(limited.headers()["retry-after"]).toBe("60");
  await admin.from("mcp_keys").update({ window_started_at: new Date(Date.now() - 61000).toISOString() }).eq("user_id", account.id);
  expect((await rpc(page.request, credential.key, "list_notes")).status()).toBe(200);
});

test("mobile plug opens connector without losing local writing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writing = "My locally saved note should survive opening the MCP connector.";
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill(writing);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "MCP connector", exact: true }).click();
  await expect(page).toHaveURL(/\/connect$/);
  await page.getByRole("link", { name: "Back to writing" }).click();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue(writing);
});

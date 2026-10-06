import { test, expect, login, localClients, type Account } from "./fixtures";
import { digest } from "../src/storage/sync/types";
import { derivePreview, deriveWordCount, deriveCharCount } from "../src/core/entry";

async function seed(account: Account, body: string, parent: string | null = null) {
  const { admin } = localClients(); const id = crypto.randomUUID(), revision = crypto.randomUUID();
  const path = `${account.id}/${id}/${revision}.md`;
  expect((await admin.storage.from("notes").upload(path, body)).error).toBeNull();
  const row = { id, user_id: account.id, storage_path: path, revision_id: revision, body_sha256: await digest(body),
    preview_text: derivePreview(body), word_count: deriveWordCount(body), char_count: deriveCharCount(body), is_recovered: !!parent, conflict_of: parent };
  expect((await admin.from("entries").insert(row)).error).toBeNull(); return row;
}
async function history(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "History", exact: true }).click(); return page.getByRole("complementary", { name: "History" });
}
test("New Entry reuses blanks; immediate switches preserve text and previews render as text", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  const first = '<img src=x onerror="alert(1)"> first entry';
  await editor.fill(first); await page.getByRole("button", { name: "New entry", exact: true }).click();
  await expect(editor).toHaveValue("\n\n"); await page.getByRole("button", { name: "New entry", exact: true }).click();
  await expect(editor).toHaveValue("\n\n"); await editor.fill("second entry");
  const panel = await history(page); await expect(panel.locator("li")).toHaveCount(2); await expect(panel.locator("img")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollLeft)).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click({ trial: true });
  await page.screenshot({ animations: "disabled", path: `.local-test/history-${test.info().project.name}.png` });
  await panel.getByRole("button", { name: `Open ${derivePreview(first)}`, exact: true }).click();
  await expect(panel).toBeHidden(); await expect(editor).toHaveValue(first);
  await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await page.reload(); await expect(editor).toHaveValue("second entry");
});
test("confirmed deletion persists in a fresh context and Cancel/Escape preserve the entry", async ({ page, browser, account }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("delete this entry");
  await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const panel = await history(page); const remove = panel.getByRole("button", { name: "Delete delete this entry", exact: true });
  await remove.click(); await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(panel).toBeVisible(); await expect(remove).toBeFocused();
  await expect(editor).toHaveValue("delete this entry"); await remove.click();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden(); await expect(editor).toHaveValue("\n\n");
  await expect(panel.getByRole("button", { name: "Open delete this entry" })).toBeHidden();
  await page.getByRole("button", { name: "Close history" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const { admin } = localClients(); const rows = await admin.from("entries").select("*").eq("user_id", account.id);
  expect(rows.data).toHaveLength(1); expect(rows.data![0].deleted_at).not.toBeNull();
  expect((await admin.storage.from("notes").download(rows.data![0].storage_path)).error).not.toBeNull();
  const fresh = await browser.newContext(); try { const other = await fresh.newPage(); await login(other, account); await expect(other.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("\n\n"); } finally { await fresh.close(); }
});
test("offline delete hides locally and publishes its tombstone after reconnect", async ({ page, context, account }) => {
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("offline deletion"); await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible(); await context.setOffline(true);
  const panel = await history(page); await panel.getByRole("button", { name: "Delete offline deletion" }).click(); await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Open offline deletion" })).toBeHidden(); await page.getByRole("button", { name: "Close history" }).click();
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online"))); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const { admin } = localClients(); expect((await admin.from("entries").select("deleted_at").eq("user_id", account.id)).data?.every(row => row.deleted_at)).toBe(true);
});
test("recovered copies are collapsed and read-only; Restore creates independent writing", async ({ page, account }) => {
  const original = await seed(account, "original winner"); const recovered = await seed(account, "recovered complete body", original.id);
  await page.getByRole("button", { name: "Sync now" }).click(); const panel = await history(page);
  await expect(panel.getByRole("button", { name: "Open recovered complete body" })).toBeHidden();
  await panel.getByText("Recovered copies (1)", { exact: true }).click();
  await page.screenshot({ animations: "disabled", path: `.local-test/recovery-${test.info().project.name}.png` });
  await panel.getByRole("button", { name: "Open recovered complete body" }).click();
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await expect(editor).toHaveValue("recovered complete body"); await expect(editor).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Restore as new entry" }).click(); await expect(editor).toBeEditable(); await expect(editor).toHaveValue("recovered complete body");
  await editor.fill("restored independent body"); await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const again = await history(page); await again.getByRole("button", { name: "Delete original winner" }).click(); await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden(); await page.getByRole("button", { name: "Close history" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const { admin } = localClients(); const recoveryRow = await admin.from("entries").select("*").eq("id", recovered.id).single();
  expect(recoveryRow.data?.deleted_at).toBeNull(); expect(await (await admin.storage.from("notes").download(recovered.storage_path)).data?.text()).toBe("recovered complete body");
  expect((await admin.from("entries").select("*").eq("user_id", account.id).eq("is_recovered", false).is("deleted_at", null)).data?.map(row => row.preview_text)).toContain("restored independent body");
});
test("an uncached offline entry cannot replace the current buffer with a blank", async ({ page, context, account }) => {
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("keep current writing"); await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await seed(account, "remote uncached body"); await page.getByRole("button", { name: "Sync now" }).click();
  const panel = await history(page); await expect(panel.getByText("Not downloaded")).toBeVisible(); await context.setOffline(true);
  await panel.getByRole("button", { name: "Open remote uncached body" }).click();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("keep current writing");
  await expect(page.getByRole("alert").filter({ hasText: /fetch|offline|connection|load failed/i })).toBeVisible(); await expect(panel).toBeVisible();
  await context.setOffline(false); await panel.getByRole("button", { name: "Open remote uncached body" }).click();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("remote uncached body");
});
test("a stale delete decision preserves another device's newer body", async ({ page, browser, account }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("base before deletion"); await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage(); await login(other, account); const otherEditor = other.getByRole("textbox", { name: "Freewrite entry" }); await expect(otherEditor).toHaveValue("base before deletion");
    const panel = await history(page); await panel.getByRole("button", { name: "Delete base before deletion" }).click();
    await otherEditor.fill("newer body survives delete"); await other.getByRole("button", { name: "Sync now" }).click(); await expect(other.getByText("Synced", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete entry", exact: true }).click();
    await expect(page.getByText("This entry changed on another device. Review it before deleting again.", { exact: false })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Open newer body survives delete" })).toBeVisible();
    await panel.getByRole("button", { name: "Open newer body survives delete" }).click(); await expect(editor).toHaveValue("newer body survives delete");
  } finally { await fresh.close(); }
});
test("switching away cleans an unused scratch slot; published blanks use tombstones", async ({ page, account }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("keep this normal entry"); await page.getByRole("button", { name: "Sync now" }).click(); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New entry", exact: true }).click(); const panel = await history(page);
  await panel.getByRole("button", { name: "Open keep this normal entry" }).click();
  const again = await history(page); await expect(again.locator("li")).toHaveCount(1); await page.getByRole("button", { name: "Close history" }).click();
  await seed(account, "\n\n"); await page.getByRole("button", { name: "Sync now" }).click(); const blanks = await history(page);
  await blanks.getByRole("button", { name: "Open Empty entry" }).click(); await expect(editor).toHaveValue("\n\n");
  await page.getByRole("button", { name: "New entry", exact: true }).click(); await expect(editor).toHaveValue("\n\n");
  const back = await history(page); await back.getByRole("button", { name: "Open keep this normal entry" }).click();
  await expect(back).toBeHidden(); await expect(editor).toHaveValue("keep this normal entry");
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const { admin } = localClients(); const rows = await admin.from("entries").select("*").eq("user_id", account.id).eq("char_count", 0);
  expect(rows.data).toHaveLength(1); expect(rows.data![0].deleted_at).not.toBeNull();
});
test("Escape closes the popup before history and restores keyboard focus", async ({ page }) => {
  const panel = await history(page); await expect(page.getByRole("button", { name: "Close history" })).toBeFocused();
  await page.getByRole("button", { name: "Font size", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Font size" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeHidden(); await expect(panel).toBeVisible();
  await page.keyboard.press("Escape"); await expect(panel).toBeHidden(); await expect(page.getByRole("button", { name: "History", exact: true })).toBeFocused();
});
test("a failed local save blocks New Entry until the current buffer is committed", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "restoreHistoryPut", { value: () => { IDBObjectStore.prototype.put = original; } });
    IDBObjectStore.prototype.put = function (...args) { if (this.name === "entries") throw new DOMException("Injected switch quota failure", "QuotaExceededError"); return original.apply(this, args); };
  });
  await editor.fill("must survive failed switch"); await expect(page.getByText("Not saved on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New entry", exact: true }).click();
  await expect(editor).toHaveValue("must survive failed switch"); await expect(page.getByText("Not saved on this device", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreHistoryPut(): void }).restoreHistoryPut());
  await page.getByRole("button", { name: "New entry", exact: true }).click(); await expect(editor).toHaveValue("\n\n");
  const panel = await history(page); await panel.getByRole("button", { name: "Open must survive failed switch" }).click(); await expect(editor).toHaveValue("must survive failed switch");
});

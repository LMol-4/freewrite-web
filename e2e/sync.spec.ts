import { test, expect, login, localClients } from "./fixtures";

test("explicit save reaches a fresh browser; safe sign-out flushes and preserves cloud writing", async ({ page, browser, account }) => {
  const text = "Complete cloud writing with unicode: café 🌍\nSecond line.";
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill(text);
  await page.keyboard.press("Control+s"); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const fresh = await browser.newContext();
  try { const other = await fresh.newPage(); await login(other, account); await expect(other.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue(text); }
  finally { await fresh.close(); }
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill(text + "\nSaved by sign-out.");
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/sign-in/);
  await login(page, account); await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue(text + "\nSaved by sign-out.");
});
test("loaded app retains offline writing, blocks safe sign-out and reconnects", async ({ page, context, browser, account }) => {
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("written with no connection");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("written with no connection");
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const fresh = await browser.newContext(); try { const other = await fresh.newPage(); await login(other, account); await expect(other.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("written with no connection"); } finally { await fresh.close(); }
});
test("dirty focus preserves losing text including typing during conflict resolution", async ({ page, browser, account }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("shared base");
  await page.keyboard.press("Control+s"); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const second = await browser.newContext();
  try {
    const other = await second.newPage(); await login(other, account); const otherEditor = other.getByRole("textbox", { name: "Freewrite entry" }); await expect(otherEditor).toHaveValue("shared base");
    await second.setOffline(true); await otherEditor.fill("first losing text");
    await editor.fill("winning complete body"); await page.keyboard.press("Control+s"); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let attempted!: () => void; const request = new Promise<void>(resolve => { attempted = resolve; });
    await other.route("**/rest/v1/rpc/publish_entry", async route => { attempted(); await gate; await route.continue(); });
    await second.setOffline(false); await other.evaluate(() => window.dispatchEvent(new Event("focus"))); await request;
    await otherEditor.fill("latest complete losing text typed during request"); await expect(other.getByText("Saved on this device", { exact: true })).toBeVisible(); release();
    await expect(other.getByText("This entry changed on another device. Your version was saved separately.", { exact: false })).toBeVisible();
    await expect(otherEditor).toHaveValue("winning complete body");
    const client = localClients().user(); await client.auth.signInWithPassword(account);
    const { data, error } = await client.from("entries").select("*").eq("is_recovered", true); expect(error).toBeNull(); expect(data).toHaveLength(1);
    const download = await client.storage.from("notes").download(data![0].storage_path); expect(await download.data?.text()).toBe("latest complete losing text typed during request");
  } finally { await second.close(); }
});
test("lost publication response survives reload and retries the same receipt", async ({ page, account }) => {
  let committed!: () => void; const published = new Promise<void>(resolve => { committed = resolve; });
  await page.route("**/rest/v1/rpc/publish_entry", async route => { await route.fetch(); committed(); await route.abort(); });
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("body with lost acknowledgement");
  await page.keyboard.press("Control+s"); await published;
  await page.reload(); await page.unroute("**/rest/v1/rpc/publish_entry"); await page.getByRole("button", { name: "Sync now" }).click();
  await expect(editor).toHaveValue("body with lost acknowledgement"); await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const client = localClients().user(); await client.auth.signInWithPassword(account);
  const rows = await client.from("entries").select("*"); expect(rows.data).toHaveLength(1); expect(rows.data![0].is_recovered).toBe(false);
  expect((await client.from("entry_receipts").select("*")).data).toHaveLength(1);
});
test("failed upload cannot publish; a large Unicode note retries without truncation", async ({ page, account }) => {
  const body = "A complete line with café and 🌍.\n".repeat(3000);
  await page.route("**/storage/v1/object/notes/**", route => route.request().method() === "POST" ? route.abort() : route.continue());
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill(body);
  await page.keyboard.press("Control+s"); await expect(page.getByText(/Sync error:/)).toBeVisible();
  await expect(editor).toHaveValue(body);
  const client = localClients().user(); await client.auth.signInWithPassword(account);
  expect((await client.from("entries").select("*")).data).toEqual([]);
  await page.unroute("**/storage/v1/object/notes/**"); await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  const rows = await client.from("entries").select("*"); expect(rows.data).toHaveLength(1);
  const downloaded = await client.storage.from("notes").download(rows.data![0].storage_path);
  expect(await downloaded.data?.text()).toBe(body);
});

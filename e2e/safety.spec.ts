import { test, expect, login, localClients } from "./fixtures";
test("cancel and failed sign-out retain writing; explicit discard clears only this account", async ({ page, account }) => {
  await page.route("**/rest/v1/rpc/publish_entry", route => route.abort());
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await editor.fill("Unsynced writing must survive"); await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveValue("Unsynced writing must survive");
  await page.route("**/auth/v1/logout**", route => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"injected failure"}' }));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Discard local writing and sign out" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("retained");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(/Your session changed/)).toBeVisible();
  await page.unroute("**/auth/v1/logout**");
  await login(page, account); await expect(editor).toHaveValue("Unsynced writing must survive");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Discard local writing and sign out" }).click();
  await expect(page).toHaveURL(/sign-in/); await login(page, account); await expect(editor).toHaveValue("\n\n");
});
test("one tab writes, another stays read-only and is locked by sign-out", async ({ page, context }) => {
  await page.route("**/rest/v1/rpc/publish_entry", route => route.abort());
  const editor = page.getByRole("textbox", { name: "Freewrite entry" }); await editor.fill("two-tab secret");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  const second = await context.newPage(); await second.goto("/");
  await expect(second.getByRole("textbox", { name: "Freewrite entry" })).toHaveAttribute("readonly", "");
  await expect(second.getByText(/Read-only: another tab/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.getByRole("button", { name: "Discard local writing and sign out" }).click();
  await expect(page).toHaveURL(/sign-in/);
  await expect(second.getByRole("textbox", { name: "Freewrite entry" })).toBeHidden();
  await second.close();
});
test("preferences propagate through the server into an independent browser context", async ({ page, browser, account }) => {
  await page.getByRole("button", { name: "Dark Mode" }).click(); await expect(page.getByText("Preferences synced", { exact: true })).toBeVisible();
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  try { await login(second, account); await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
    await second.getByRole("button", { name: "Serif", exact: true }).click(); await expect(second.getByText("Preferences synced", { exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Serif", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally { await secondContext.close(); }
});
test("account B cannot see A's local writing after an external session change or Back", async ({ page, createAccount }) => {
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("private A retained");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  const b = await createAccount(); await login(page, b);
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("\n\n");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeHidden();
  await login(page, b);
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).not.toHaveValue("private A retained");
});
test("RLS and Storage reject anonymous and cross-account access", async ({ account, createAccount }) => {
  const b = await createAccount(); const { user, admin } = localClients(); const aClient = user(); const bClient = user(); const anonymous = user();
  expect((await aClient.auth.signInWithPassword(account)).error).toBeNull(); expect((await bClient.auth.signInWithPassword(b)).error).toBeNull();
  const id = crypto.randomUUID(); const path = `${account.id}/${id}.md`;
  expect((await aClient.storage.from("notes").upload(path, "private body", { contentType: "text/markdown" })).error).toBeNull();
  expect((await aClient.from("entries").insert({ id, user_id: account.id, storage_path: path })).error).not.toBeNull();
  expect((await admin.from("entries").insert({ id, user_id: account.id, storage_path: path, preview_text: "private", word_count: 2, char_count: 12 })).error).toBeNull();
  expect((await bClient.from("entries").select("*").eq("id", id)).data).toEqual([]);
  expect((await anonymous.from("entries").select("*").eq("id", id)).data ?? []).toEqual([]);
  expect((await bClient.storage.from("notes").download(path)).error).not.toBeNull();
  expect((await anonymous.storage.from("notes").download(path)).error).not.toBeNull();
  expect((await bClient.storage.from("notes").upload(`${account.id}/forged.md`, "forged")).error).not.toBeNull();
  expect((await bClient.from("preferences").select("*").eq("user_id", account.id)).data).toEqual([]);
  expect((await anonymous.rpc("get_preferences")).error).not.toBeNull();
  expect((await aClient.from("preferences").update({ theme: "dark" }).eq("user_id", account.id)).error).not.toBeNull();
  const initial = await aClient.rpc("get_preferences"); const version = initial.data![0].version;
  const results = await Promise.all([aClient.rpc("publish_preferences", { requested_user_id: account.id, expected_version: version, patch: { theme: "dark" } }), aClient.rpc("publish_preferences", { requested_user_id: account.id, expected_version: version, patch: { font: "serif" } })]);
  expect(results.map(r => r.error)).toEqual([null, null]);
  expect(results.map(r => r.data?.length).sort()).toEqual([0, 1]);
  expect((await bClient.rpc("publish_preferences", { requested_user_id: account.id, expected_version: version + 1, patch: { theme: "light" } })).error).not.toBeNull();
});

test("a missing browser session locks the editor without deleting its partition", async ({ page, context, account }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await editor.fill("retained through session expiry"); await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await context.clearCookies(); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(editor).toBeHidden(); await expect(page.getByText(/Your session changed/)).toBeVisible();
  await login(page, account); await expect(editor).toHaveValue("retained through session expiry");
});

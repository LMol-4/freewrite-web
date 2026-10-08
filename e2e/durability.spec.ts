import { test, expect, login } from "./fixtures";
test("a quota failure never reports saved and retains the editable buffer for retry", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "restorePut", { value: () => { IDBObjectStore.prototype.put = original; } });
    IDBObjectStore.prototype.put = function (...args) { if (this.name === "entries") throw new DOMException("Injected quota failure", "QuotaExceededError"); return original.apply(this, args); };
  });
  await editor.fill("still available to copy"); await expect(page.getByText("Not saved on this device", { exact: true })).toBeAttached();
  await expect(page.getByRole("alert").filter({ hasText: "Injected quota failure" })).toBeVisible(); await expect(editor).toHaveValue("still available to copy"); await expect(page.getByText("Saved on this device", { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { restorePut(): void }).restorePut());
  await page.getByRole("button", { name: "Retry local save" }).click(); await expect(page.locator('.sync-status')).toHaveAttribute('data-local', 'Saved on this device');
  await page.reload(); await expect(editor).toHaveValue("still available to copy");
  await expect(page.getByRole("alert").filter({ hasText: "Injected quota failure" })).toHaveCount(0);
});
test("continuous input commits before idle and preserves IME input and selection", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await page.evaluate(() => {
    const bodies: string[] = []; Object.defineProperty(window, "committedBodies", { value: bodies });
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "entries") this.transaction.addEventListener("complete", () => bodies.push(value.body));
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await editor.fill("");
  await editor.pressSequentially("continuous writing", { delay: 20 });
  await expect(page.locator('.sync-status')).toHaveAttribute('data-local', 'Saved on this device');
  expect(await page.evaluate(() => (window as unknown as { committedBodies: string[] }).committedBodies.some(body => body.length > 0 && body.length < "continuous writing".length))).toBe(true);
  await editor.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(input, "continuous writing 日本語");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "日本語", isComposing: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本語" }));
    input.setSelectionRange(5, 5);
  });
  await expect(page.locator('.sync-status')).toHaveAttribute('data-local', 'Saved on this device');
  expect(await editor.evaluate(e => (e as HTMLTextAreaElement).selectionStart)).toBe(5);
  await page.reload(); await expect(editor).toHaveValue("continuous writing 日本語");
});
test("dark theme is present before hydration and stays dark without hydration errors", async ({ page }) => {
  await page.getByRole("button", { name: "Dark Mode" }).click(); await expect(page.locator('.sync-status')).toHaveAttribute('data-preferences', 'Preferences synced');
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async route => { await gate; await route.continue(); });
  try {
    await page.reload({ waitUntil: "commit" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.evaluate(() => {
      const changes: string[] = []; Object.defineProperty(window, "themeChanges", { value: changes });
      new MutationObserver(records => { for (const record of records) if (record.oldValue) changes.push(record.oldValue); changes.push(document.documentElement.dataset.theme ?? ""); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], attributeOldValue: true });
    });
  } finally { release(); }
  await expect(page.getByRole("button", { name: "Light Mode" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const painted = await page.evaluate(() => new Promise<string | undefined>(resolve => requestAnimationFrame(() => resolve(document.documentElement.dataset.theme))));
  expect(painted).toBe("dark");
  expect(await page.evaluate(() => (window as unknown as { themeChanges: string[] }).themeChanges)).not.toContain("light");
  expect(errors.filter(error => /hydration|did not match|server rendered/i.test(error))).toEqual([]);
});
test("dialogs trap focus, default to Cancel and restore focus", async ({ page }) => {
  await page.route("**/rest/v1/rpc/publish_entry", route => route.abort());
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("keep this");
  const signOut = page.getByRole("button", { name: "Sign out", exact: true }); await signOut.click();
  const cancel = page.getByRole("button", { name: "Cancel", exact: true }); await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "Discard local writing and sign out" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeHidden(); await expect(signOut).toBeFocused();
  const font = page.getByRole("button", { name: "Font size", exact: true }); await font.click(); await page.keyboard.press("Escape"); await expect(font).toBeFocused();
});
test("offline preferences retry after reconnect and are visible to a fresh context", async ({ page, context, browser, account }) => {
  await expect(page.locator('.sync-status')).toHaveAttribute('data-preferences', 'Preferences synced');
  await context.setOffline(true); await page.getByRole("button", { name: "Dark Mode" }).click();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-preferences', 'Preferences pending');
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator('.sync-status')).toHaveAttribute('data-preferences', 'Preferences synced');
  const fresh = await browser.newContext(); try { const other = await fresh.newPage(); await login(other, account); await expect(other.locator("html")).toHaveAttribute("data-theme", "dark"); } finally { await fresh.close(); }
});
test("account change in another tab hides the old account's buffer", async ({ page, context, createAccount }) => {
  await page.getByRole("textbox", { name: "Freewrite entry" }).fill("A only"); await expect(page.locator('.sync-status')).toHaveAttribute('data-local', 'Saved on this device');
  // Simulate credentials being replaced outside this tab. Authenticated users
  // now correctly skip the sign-in form, so expire cookies before signing in.
  await context.clearCookies();
  const b = await createAccount(); const second = await context.newPage(); await login(second, b);
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeHidden(); await expect(second.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("\n\n"); await second.close();
});


test("fallback without Web Locks keeps the second tab read-only", async ({ browser, account }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  try {
    const first = await context.newPage(); await login(first, account); await expect(first.getByRole("textbox", { name: "Freewrite entry" })).toBeEditable();
    const second = await context.newPage(); await second.goto("/"); await expect(second.getByText(/Read-only: another tab/)).toBeVisible();
    await expect(second.getByRole("textbox", { name: "Freewrite entry" })).not.toBeEditable();
  } finally { await context.close(); }
});
test("legacy browser records survive upgrade and sign-out without adoption", async ({ browser, account }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const request = indexedDB.open("freewrite", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "id" }).put({ id: "legacy-fixture", body: "unassigned legacy text" });
    request.onsuccess = () => request.result.close();
  });
  try {
    const page = await context.newPage(); await login(page, account);
    await expect(page.getByText(/1 legacy entries are preserved/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue("\n\n");
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/sign-in/);
    const body = await page.evaluate(() => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("freewrite"); request.onerror = () => reject(request.error); request.onsuccess = () => {
        const db = request.result; const tx = db.transaction("legacy"); const get = tx.objectStore("legacy").get("legacy-fixture"); get.onsuccess = () => resolve(get.result.body); tx.oncomplete = () => db.close();
      };
    }));
    expect(body).toBe("unassigned legacy text");
  } finally { await context.close(); }
});

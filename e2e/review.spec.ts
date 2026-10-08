import { test, expect } from "./fixtures";

test("timer works when audio initialization fails", async ({ page }) => {
  await page.evaluate(() => {
    window.Audio = class { constructor() { throw new DOMException("Audio unavailable", "NotSupportedError"); } } as unknown as typeof Audio;
  });
  await page.clock.install();
  await page.getByRole("button", { name: "15:00", exact: true }).click();
  await page.clock.fastForward(3000);
  await expect(page.getByRole("button", { name: "14:57", exact: true })).toBeVisible();
});

test("typing updates history without scanning all saved bodies", async ({ page, context }) => {
  await expect(page.locator(".sync-status")).toHaveAttribute("data-state", "synced");
  await context.setOffline(true);
  await page.evaluate(() => {
    const state = window as typeof window & { historyScans: number };
    state.historyScans = 0;
    const getAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === "entries") state.historyScans++;
      return getAll.apply(this, args);
    };
  });
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await editor.fill("Typing stays responsive");
  await expect(page.locator(".sync-status")).toHaveAttribute("data-local", "Saved on this device");
  expect(await page.evaluate(() => (window as typeof window & { historyScans: number }).historyScans)).toBe(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Typing stays responsive", exact: true })).toBeVisible();
});

test("entry switches isolate undo while theme changes preserve selection and scrolling", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  const first = "First entry private text";
  await editor.fill("");
  await editor.pressSequentially(first);
  await page.getByRole("button", { name: "New entry", exact: true }).click();
  await expect(editor).toHaveValue("\n\n");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveValue("\n\n");
  const body = Array.from({ length: 150 }, (_, i) => `Line ${i}: keep this writing in place.`).join("\n");
  await editor.fill(body);
  await editor.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    input.setSelectionRange(1200, 1220);
    input.scrollTop = 600;
  });
  const position = await editor.evaluate(element => ({ top: element.scrollTop, start: (element as HTMLTextAreaElement).selectionStart, end: (element as HTMLTextAreaElement).selectionEnd }));
  await page.getByRole("button", { name: "Dark Mode", exact: true }).click();
  expect(await editor.evaluate(element => ({ top: element.scrollTop, start: (element as HTMLTextAreaElement).selectionStart, end: (element as HTMLTextAreaElement).selectionEnd }))).toEqual(position);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: `Open ${first}`, exact: true }).click();
  await expect(editor).toHaveValue(first);
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveValue(first);
});

test("dismissing a font popup by clicking the editor keeps typing in the editor", async ({ page }) => {
  await page.getByRole("button", { name: "Font size", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await editor.click();
  await expect(page.getByRole("dialog", { name: "Font size" })).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.keyboard.type("Continue writing");
  await expect(editor).toHaveValue(/Continue writing/);
});

test("history at the desktop breakpoint leaves the toolbar reachable", async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click({ trial: true });
  const editor = await page.getByRole("textbox", { name: "Freewrite entry" }).boundingBox();
  const panel = await page.getByRole("complementary", { name: "History" }).boundingBox();
  expect(editor!.x + editor!.width).toBeLessThanOrEqual(panel!.x);
  await page.screenshot({ path: info.outputPath("history-breakpoint.png") });
});

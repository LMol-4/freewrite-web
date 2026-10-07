import { expect, test } from "./fixtures";
import { CHATGPT_PROMPT, CLAUDE_PROMPT, CHAT_TOO_SHORT_MESSAGE } from "../src/core/prompts";

const harmless = "The garden has blue flowers and a wooden bench. ".repeat(8);

test.beforeEach(async ({ context }) => {
  // Even regression failures must never send fixture writing to an AI service.
  await context.route(/https:\/\/(chat\.openai\.com|chatgpt\.com|claude\.ai)(\/|$)/, route => route.fulfill({
    status: 200, contentType: "text/html", body: "<p>Intercepted AI destination</p>",
  }));
});

test("Chat gates trimmed length and restores keyboard focus", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await expect(editor).toBeEditable();
  await editor.fill("  " + "a".repeat(349) + "  ");
  const chat = page.getByRole("button", { name: "Chat", exact: true });
  await chat.click();
  await expect(page.getByRole("alertdialog")).toHaveText(CHAT_TOO_SHORT_MESSAGE + "OK");
  await page.keyboard.press("Escape");
  await expect(chat).toBeFocused();
  await editor.fill("  " + "a".repeat(350) + "  ");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await chat.click();
  const popup = page.getByRole("dialog", { name: "Send to AI" });
  await expect(popup.getByRole("button", { name: "ChatGPT" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(popup.getByRole("button", { name: "Claude" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(chat).toBeFocused();
  await expect(page.getByRole("complementary", { name: "History" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "History" })).toBeHidden();
});

for (const [destination, prompt, url] of [
  ["ChatGPT", CHATGPT_PROMPT, "https://chat.openai.com/"],
  ["Claude", CLAUDE_PROMPT, "https://claude.ai/new"],
] as const) {
  test(`${destination} waits for clipboard success and opens only on a separate click`, async ({ page, context }) => {
    await page.evaluate(() => {
      const state = window as typeof window & { copied?: string; finishCopy?: () => void };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: (text: string) => { state.copied = text; return new Promise<void>(resolve => { state.finishCopy = resolve; }); },
      } });
    });
    await page.getByRole("textbox", { name: "Freewrite entry" }).fill("  " + harmless + "  ");
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: destination, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Chat with ${destination}` });
    await expect(dialog.getByRole("button", { name: "Copy prompt" })).toBeFocused();
    await expect(dialog).toContainText(`Sending it shares this writing with ${destination}`);
    const link = dialog.getByRole("link", { name: `Open ${destination}` });
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await dialog.getByRole("button", { name: "Copy prompt" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copying…");
    expect(context.pages()).toHaveLength(1);
    expect(await page.evaluate(() => (window as typeof window & { copied?: string }).copied)).toBe(prompt + "\n\n" + harmless.trim());
    await page.evaluate(() => (window as typeof window & { finishCopy?: () => void }).finishCopy?.());
    await expect(dialog.getByRole("status")).toContainText("Prompt copied.");
    expect(context.pages()).toHaveLength(1);
    await dialog.getByRole("button", { name: "Copy prompt" }).focus();
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const opened = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    const target = await opened;
    await target.waitForLoadState();
    expect(target.url()).toBe(url);
    expect(await target.evaluate(() => window.opener)).toBeNull();
    expect(await target.evaluate(() => document.referrer)).toBe("");
    await target.close();
    await page.bringToFront();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeFocused();
  });
}

for (const mode of ["denied", "unavailable"] as const) {
  test(`clipboard ${mode} exposes the complete long Unicode prompt for manual copy`, async ({ page }, testInfo) => {
    await page.evaluate(mode => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "unavailable" ? undefined : {
        writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
      } });
    }, mode);
    const body = "Harmless flowers 🌼 & trees <garden>\n".repeat(400);
    await page.getByRole("textbox", { name: "Freewrite entry" }).fill(body);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "Claude", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Chat with Claude" });
    await dialog.getByRole("button", { name: "Copy prompt" }).click();
    await expect(dialog.getByRole("alert")).toContainText("copy it manually");
    await expect(dialog.getByRole("status")).not.toContainText("Prompt copied");
    const manual = dialog.getByRole("textbox", { name: "Prompt to copy" });
    await expect(manual).toHaveValue(CLAUDE_PROMPT + "\n\n" + body.trim());
    await manual.focus();
    expect(await manual.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe((CLAUDE_PROMPT + "\n\n" + body.trim()).length);
    await expect(dialog.getByRole("link", { name: "Open Claude" })).toHaveAttribute("href", "https://claude.ai/new");
    await page.screenshot({ path: testInfo.outputPath("manual-copy.png"), animations: "disabled" });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.resolve() } });
    });
    await dialog.getByRole("button", { name: "Copy prompt" }).click();
    await expect(dialog.getByRole("status")).toContainText("Prompt copied.");
    await expect(manual).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toHaveValue(body);
  });
}

test("closing a pending copy cannot mark a later prompt copied", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => new Promise<void>(resolve => { (window as typeof window & { finishCopy?: () => void }).finishCopy = resolve; }),
    } });
  });
  const editor = page.getByRole("textbox", { name: "Freewrite entry" });
  await editor.fill(harmless);
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "ChatGPT", exact: true }).click();
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Copying…");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await editor.fill(harmless + " A new harmless ending.");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await page.evaluate(() => (window as typeof window & { finishCopy?: () => void }).finishCopy?.());
  await expect(page.getByRole("dialog").getByRole("status")).toBeEmpty();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeEnabled();
});

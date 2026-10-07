import { expect, test } from "./fixtures";

test.describe("editor", () => {
  test("shows a placeholder that hides once there's text, and text survives a reload", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator("textarea.editor");
    const placeholder = page.locator(".placeholder");

    await expect(editor).toBeVisible();
    await expect(placeholder).toBeVisible();
    const placeholderText = await placeholder.textContent();
    expect(placeholderText?.length).toBeGreaterThan(0);

    await editor.click();
    await editor.pressSequentially("what a nice place to write things down");
    await expect(placeholder).toBeHidden();

    await expect(page.getByRole("status", { name: "" }).filter({ hasText: /^Saved on this device$/ })).toHaveText("Saved on this device");
    await page.reload();

    await expect(page.locator("textarea.editor")).toHaveValue(/what a nice place to write things down/);
    await expect(page.locator(".placeholder")).toBeHidden();
  });
});

test.describe("fonts and size", () => {
  test("font and size selections persist across a reload", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator("textarea.editor");

    await page.getByText("Serif", { exact: true }).click();
    await page.getByText("18px", { exact: true }).click();
    await page.locator(".size-option", { hasText: "24px" }).click();

    await expect(editor).toHaveCSS("font-size", "24px");

    await expect(page.getByText("Preferences synced", { exact: true })).toBeAttached();
    await page.reload();

    await expect(page.locator("textarea.editor")).toHaveCSS("font-size", "24px");
    const serifButton = page.getByText("Serif", { exact: true });
    await expect(serifButton).toHaveCSS("font-weight", "700");
  });
});

test.describe("theme", () => {
  test("toggles and survives a reload with the correct theme already applied", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByText("Dark Mode", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByText("Light Mode", { exact: true })).toBeVisible();

    await page.reload();

    // The blocking pre-paint script (§9 Theming) must have already applied
    // dark mode by the time the page finishes loading — no flash to light.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(30, 30, 30)");
  });
});

test.describe("timer", () => {
  test("starts, pauses without losing time, completes with a fade, then resets", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator("textarea.editor");
    const timerButton = page.locator(".control-item", { hasText: ":" }).first();

    await expect(timerButton).toHaveText("15:00");
    await expect(editor).toBeEditable();
    await expect(timerButton).toBeEnabled();
    await expect(page.getByText("Synced", { exact: true })).toBeAttached();

    // Install the fake clock only after the app has hydrated — installing it
    // before navigation freezes React's own scheduler and the page never
    // becomes interactive.
    await page.clock.install();

    await timerButton.click();
    await page.clock.fastForward("00:03");
    await expect(timerButton).not.toHaveText("15:00");
    const runningLabel = await timerButton.textContent();
    expect(runningLabel).not.toBe("15:00");

    await timerButton.click();
    await page.clock.fastForward("00:05");
    await expect(timerButton).toHaveText(runningLabel ?? "");

    await timerButton.click();
    await page.clock.fastForward("15:00");
    await page.waitForTimeout(50);

    await expect(timerButton).toHaveText("0:00");
    // T3: the fade is a text-color change, not opacity — the caret must stay
    // fully opaque, matching the original (`css/styles.css:345-347`).
    await expect(editor).toHaveCSS("color", "rgba(51, 51, 51, 0.3)");
    await expect(editor).toHaveCSS("caret-color", "rgb(51, 51, 51)");

    await page.clock.fastForward("00:06");
    await page.waitForTimeout(400);

    await expect(timerButton).toHaveText("15:00");
    await expect(editor).toHaveCSS("color", "rgb(51, 51, 51)");
  });
});

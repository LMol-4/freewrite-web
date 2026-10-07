import { test, expect } from "./fixtures";

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible(); });

test('mobile sheets share preferences, history and AI actions', async ({ page }, testInfo) => {
  const editor = page.getByRole('textbox', { name: 'Freewrite entry' });
  await editor.fill('Mobile writing survives sheet navigation.');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '22px', exact: true }).click();
  await menu.getByRole('button', { name: 'Serif', exact: true }).click();
  await menu.getByRole('button', { name: 'Dark Mode', exact: true }).click();
  await expect(editor).toHaveCSS('font-size', '22px');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e1e1e');
  await page.screenshot({ path: testInfo.outputPath('mobile-menu.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'History', exact: true })).toBeVisible();
  const short = await page.locator('.history-sheet').boundingBox();
  await page.getByRole('button', { name: 'Expand history' }).click();
  const tall = await page.locator('.history-sheet').boundingBox();
  expect(tall!.height).toBeGreaterThan(short!.height);
  await page.screenshot({ path: testInfo.outputPath('mobile-history.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(editor).toHaveValue('Mobile writing survives sheet navigation.');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Send to AI', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('mobile-writer.png'), animations: 'disabled' });
});

test('timer hides chrome but explicit reveal can pause it', async ({ page }) => {
  await page.getByRole('button', { name: '15:00', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible();
  await page.getByRole('button', { name: 'Show controls' }).click();
  const timer = page.locator('.mobile-bar button').nth(1);
  await expect(timer).toBeVisible();
  await timer.click();
  const label = await timer.textContent();
  await page.waitForTimeout(1200);
  await expect(timer).toHaveText(label!);
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
});

test('continuous typing hides chrome, pause leaves it hidden and keyboard reveal works', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Freewrite entry' });
  await editor.focus();
  await editor.pressSequentially('continuous typing keeps going', { delay: 130 });
  await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.locator('.mobile-bar')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Show controls' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mobile-bar')).not.toHaveAttribute('inert', '');
  await expect(editor).toHaveValue(/continuous typing keeps going/);
});

test('keyboard timer stays available and completion reveals pointer-hidden controls', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Freewrite entry' })).toBeEditable();
  await page.clock.install();
  const timer = page.getByRole('button', { name: '15:00', exact: true });
  await timer.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.mobile-bar')).not.toHaveAttribute('inert', '');
  await page.keyboard.press('Enter'); await timer.click();
  await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible();
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(page.locator('textarea.editor')).toHaveClass(/faded/);
  await expect(page.locator('.mobile-bar')).not.toHaveAttribute('inert', '');
});

test('viewport offsets clamp and controls fit small landscape viewports', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 400 });
    Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 20 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.mobile-bar')).toHaveCSS('bottom', '424px');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 1000 });
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.mobile-bar')).toHaveCSS('bottom', '0px');
  await page.evaluate(() => { delete (window.visualViewport as unknown as Record<string, unknown>).height; delete (window.visualViewport as unknown as Record<string, unknown>).offsetTop; });
  await page.setViewportSize({ width: 600, height: 320 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  expect((await menu.boundingBox())!.height).toBeLessThanOrEqual(320);
  await menu.getByRole('button', { name: 'Close menu', exact: true }).last().click();
});

test('eligible mobile AI pane and fullscreen failure preserve writing', async ({ page }) => {
  const body = 'Mobile AI writing. '.repeat(30);
  await page.getByRole('textbox', { name: 'Freewrite entry' }).fill(body);
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    document.documentElement.requestFullscreen = async () => { throw Error('denied'); };
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('alert')).toContainText('Fullscreen could not open');
  await page.getByRole('button', { name: 'Send to AI', exact: true }).click();
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Chat with Claude' })).toBeVisible();
  expect((await page.getByRole('link', { name: 'Open Claude' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Freewrite entry' })).toHaveValue(body);
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
});

test('unsupported fullscreen offers a dismissible hint and standalone suppresses it', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }));
  const open = page.getByRole('button', { name: 'Menu', exact: true });
  await open.click();
  await expect(page.getByText(/For an app window/)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss install hint' }).click();
  await page.keyboard.press('Escape'); await open.click();
  await expect(page.getByText(/For an app window/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    localStorage.removeItem('freewrite:install-dismissed');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  });
  await open.click();
  await expect(page.getByText(/For an app window/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveCount(0);
});

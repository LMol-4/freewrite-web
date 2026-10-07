import { test, expect, syncNow } from "./fixtures";

test("sync status is quiet, expands for errors and never claims synced on failure", async ({ page }, info) => {
  const indicator = page.getByRole("button", { name: "Sync status", exact: true });
  await expect(page.locator('.sync-status')).toHaveAttribute('data-state', 'synced');
  await expect(indicator).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toHaveCount(0);
  await page.route('**/rest/v1/entry_receipts*', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: "Could not find the table 'public.entry_receipts' in the schema cache" }) }));
  await page.getByRole('textbox', { name: 'Freewrite entry' }).fill('Retain this local writing through a backend failure.');
  await syncNow(page);
  await expect(page.locator('.sync-status')).toHaveAttribute('data-state', 'attention');
  await indicator.click();
  await expect(page.locator('.sync-panel')).toBeVisible();
  await expect(page.locator('.sync-panel')).toContainText("public.entry_receipts");
  await expect(page.locator('.sync-panel').getByText('Synced', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('sync-error.png') });
  await page.keyboard.press('Escape');
  await expect(indicator).toBeFocused();
  await expect(indicator).toHaveAttribute('aria-expanded', 'false');
  await page.unroute('**/rest/v1/entry_receipts*');
  await syncNow(page);
  await expect(page.locator('.sync-status')).toHaveAttribute('data-state', 'synced');
});

for (const mobile of [false, true]) test(`timer reset and borderless writing (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, info) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.getByRole('textbox', { name: 'Freewrite entry' });
  await editor.fill('The timer reset must preserve this writing.');
  await expect(editor).toHaveCSS('outline-style', 'none');
  await page.clock.install();
  await page.getByRole('button', { name: '15:00', exact: true }).click();
  await page.clock.fastForward(65000);
  if (mobile) await page.getByRole('button', { name: 'Show controls' }).click();
  await page.getByRole('button', { name: 'Reset timer', exact: true }).click();
  await expect(page.getByRole('button', { name: '15:00', exact: true })).toBeVisible();
  await page.clock.fastForward(5000);
  await expect(page.getByRole('button', { name: '15:00', exact: true })).toBeVisible();
  await expect(editor).not.toHaveClass(/faded/);
  await expect(editor).toHaveValue('The timer reset must preserve this writing.');
  await page.getByRole('button', { name: '15:00', exact: true }).click();
  await page.clock.fastForward(3000);
  if (mobile) await page.getByRole('button', { name: 'Show controls' }).click();
  await page.getByRole('button', { name: '14:57', exact: true }).click();
  await page.getByRole('button', { name: 'Reset timer', exact: true }).click();
  await page.getByRole('button', { name: '15:00', exact: true }).click();
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(editor).toHaveClass(/faded/);
  await page.getByRole('button', { name: 'Reset timer', exact: true }).click();
  await expect(editor).not.toHaveClass(/faded/);
  await expect(page.getByRole('button', { name: '15:00', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('quiet-writer.png') });
});

test('preference failure stays in details without a conflicting synced claim', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_preferences', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Preference function unavailable' }) }));
  await page.reload();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-state', 'attention');
  await page.getByRole('button', { name: 'Sync status', exact: true }).click();
  const panel = page.locator('.sync-panel');
  await expect(panel).toContainText('Preferences could not sync');
  await expect(panel.getByText('Preferences synced', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Retry preferences' })).toBeVisible();
  await page.unroute('**/rest/v1/rpc/get_preferences');
  await panel.getByRole('button', { name: 'Retry preferences' }).click();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 15000 });
});

test('font changes preserve editor geometry, chosen size and matching placeholder metrics', async ({ page }, info) => {
  const editor = page.getByRole('textbox', { name: 'Freewrite entry' });
  const before = await editor.boundingBox();
  for (const name of ['Lato', 'System', 'Serif']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(editor).toHaveCSS('font-size', '18px');
    await expect(editor).toHaveCSS('font-size-adjust', '0.5065');
    const lineHeight = await editor.evaluate(element => getComputedStyle(element).lineHeight);
    await expect(page.locator('.placeholder')).toHaveCSS('line-height', lineHeight);
    expect(parseFloat(lineHeight)).toBeCloseTo(28.8, 1);
    expect(await editor.boundingBox()).toEqual(before);
  }
  // Exercise every random face, including Noto's unusually deep original descent.
  for (let i = 0; i < 6; i++) {
    await page.evaluate(value => { Math.random = () => value; }, (i + .1) / 6);
    await page.getByRole('button', { name: /^Random/ }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await editor.boundingBox()).toEqual(before);
    await editor.fill('Writing stays on the same line. xxxxx HHHH gggg');
    await page.screenshot({ path: info.outputPath(`font-${i}.png`) });
    await editor.fill('');
  }
});

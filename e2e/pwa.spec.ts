import { test, expect, login, localClients } from './fixtures';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test.use({ serviceWorkers: 'allow' });
const gateway = 'supabase_kong_freewrite-web-disposable';
let disconnected = false;
async function disconnect() {
  // WebKit can bypass Playwright routes for worker-controlled pages. Stop only
  // the verified disposable gateway; DB/Storage containers and data stay intact.
  localClients();
  const result = spawnSync('docker', ['stop', '--time', '1', gateway], { encoding: 'utf8' });
  if (result.status !== 0) throw Error('Could not disconnect disposable gateway');
  disconnected = true;
  writeFileSync('.local-test/origin-disconnected', 'local fault injection');
}
async function reconnect() {
  rmSync('.local-test/origin-disconnected', { force: true });
  if (!disconnected) return;
  const label = spawnSync('docker', ['inspect', gateway, '--format', '{{ index .Config.Labels "com.supabase.cli.project" }}'], { encoding: 'utf8' });
  if (label.stdout.trim() !== 'freewrite-web-disposable') throw Error('Unexpected gateway target');
  const result = spawnSync('docker', ['start', gateway], { encoding: 'utf8' });
  if (result.status !== 0) throw Error('Could not reconnect disposable gateway');
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:55321/auth/v1/health', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } })).ok; } catch { return false; } }, { timeout: 15000 }).toBe(true);
  disconnected = false;
}
test.afterEach(async () => { await reconnect(); });

test('complete neutral cache supports a cold offline launch and reconnect', async ({ page, context, account }) => {
  await expect(page.getByText('Offline launch ready on this device', { exact: true })).toBeVisible({ timeout: 30000 });
  const editor = page.getByRole('textbox', { name: 'Freewrite entry' });
  await editor.fill('Private writing before a cold offline launch.');
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys(); const paths: string[] = []; const html: string[] = [];
    for (const key of keys.filter(k => k.startsWith('freewrite-'))) { const c = await caches.open(key); for (const r of await c.keys()) { paths.push(new URL(r.url).pathname); if (new URL(r.url).pathname === '/offline') html.push(await (await c.match(r))!.text()); } }
    return { paths, html };
  });
  expect(cache.paths).toContain('/offline');
  expect(cache.paths).not.toContain('/');
  expect(cache.paths.every(p => p === '/offline' || p.startsWith('/_next/static/') || p.startsWith('/icons/') || p.startsWith('/sounds/'))).toBe(true);
  expect(cache.html.join('')).not.toContain('Private writing before');
  expect(cache.html.join('')).not.toContain(account.id);
  expect(cache.html.join('')).not.toContain(account.email);
  await page.close(); await disconnect();
  const cold = await context.newPage(); await cold.goto('/');
  const local = cold.getByRole('textbox', { name: 'Freewrite entry' });
  await expect(local).toHaveValue('Private writing before a cold offline launch.');
  await local.fill('Private writing continued after a cold offline launch.');
  await expect(cold.getByText('Saved on this device', { exact: true })).toBeVisible();
  await reconnect();
  await cold.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(cold.getByText('Synced', { exact: true })).toBeVisible({ timeout: 30000 });
});

test('offline shell denies a signed-out account and isolates the next account', async ({ page, createAccount }) => {
  await expect(page.getByText('Offline launch ready on this device', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('textbox', { name: 'Freewrite entry' }).fill('Account A private writing');
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL('**/sign-in');
  await page.goto('/offline');
  await expect(page.getByText('Sign in online to open writing on this device.')).toBeVisible();
  const other = await createAccount(); await login(page, other);
  await page.getByRole('textbox', { name: 'Freewrite entry' }).fill('Account B private writing');
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await disconnect(); await page.goto('/offline');
  await expect(page.getByRole('textbox', { name: 'Freewrite entry' })).toHaveValue('Account B private writing');
  await expect(page.getByText('Account A private writing', { exact: true })).toHaveCount(0);
});

test('missing cached dependency revokes readiness and auth navigations never get writer fallback', async ({ page }) => {
  await expect(page.getByText('Offline launch ready on this device', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => {
    const key = (await caches.keys()).find(k => k.startsWith('freewrite-'))!; const cache = await caches.open(key);
    const asset = (await cache.keys()).find(r => r.url.endsWith('.js'))!; await cache.delete(asset);
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByText('Offline launch not prepared', { exact: true })).toBeVisible();
  await disconnect();
  const response = await page.goto('/'); expect(response?.status()).toBe(503);
  await expect(page.getByText('Offline writing is not ready.', { exact: false })).toBeVisible();
  await page.goto('/sign-in').catch(() => {});
  await expect(page.getByRole('textbox', { name: 'Freewrite entry' })).toHaveCount(0);
});

test('worker bypasses private protocols and keeps an unrelated cache intact', async ({ page }) => {
  await expect(page.getByText('Offline launch ready on this device', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => { await (await caches.open('unrelated-app')).put('/unrelated', new Response('retain')); });
  await disconnect();
  const results = await page.evaluate(async () => {
    const requests = [
      fetch('/', { headers: { RSC: '1' } }),
      fetch('/', { method: 'POST', headers: { 'Next-Action': 'test' }, body: 'not private data' }),
      fetch('/auth/callback?code=invalid'), fetch('/reset-password'), fetch('/api/example'),
    ];
    return (await Promise.allSettled(requests)).map(result => result.status);
  });
  expect(results).toEqual(Array(5).fill('rejected'));
  expect(await page.evaluate(async () => await (await (await caches.open('unrelated-app')).match('/unrelated'))!.text())).toBe('retain');
});

test('failed worker upgrade retains old cache; complete upgrade waits for live writing', async ({ page, context }) => {
  await expect(page.getByText('Offline launch ready on this device', { exact: true })).toBeVisible({ timeout: 30000 });
  const original = readFileSync('public/sw.js', 'utf8');
  const build = `upgrade-${crypto.randomUUID()}`;
  const replace = original.replace(/const BUILD = .*?;/, `const BUILD = ${JSON.stringify(build)};`);
  try {
    writeFileSync('public/sw.js', replace.replace('const PATHS =', "ASSETS.push('/_next/static/missing-upgrade.js');\nconst PATHS ="));
    await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Worker did not fail installation')), 20000);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing!;
          worker.addEventListener('statechange', () => { if (worker.state === 'redundant') { clearTimeout(timer); resolve(); } });
        }, { once: true });
        void registration.update();
      });
    });
    expect(await page.evaluate(async key => (await caches.keys()).includes(`freewrite-${key}`), build)).toBe(false);
    await page.getByRole('textbox', { name: 'Freewrite entry' }).fill('Writing remains editable across a worker update.');
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    writeFileSync('public/sw.js', replace);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Freewrite entry' })).toHaveValue('Writing remains editable across a worker update.');
    const oldBuild = await page.evaluate(async () => new Promise<string>(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = e => resolve(e.data.build); navigator.serviceWorker.controller!.postMessage('readiness', [channel.port2]); }));
    expect(oldBuild).not.toBe(build);
    await page.close();
    const next = await context.newPage(); await next.goto('/');
    await expect.poll(() => next.evaluate(async () => new Promise<string>(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = e => resolve(e.data.build); navigator.serviceWorker.controller!.postMessage('readiness', [channel.port2]); }))).toBe(build);
    await disconnect(); await next.reload();
    await expect(next.getByRole('textbox', { name: 'Freewrite entry' })).toHaveValue('Writing remains editable across a worker update.');
  } finally { writeFileSync('public/sw.js', original); }
});

import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { claimAccount, closeDatabase, setAccountLock, clearAccount, openFreewriteDB } from './local/indexeddb';
import { rememberAccount, forgetAccount, offlineAccount } from './offline-access';
const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
beforeEach(async () => {
  await closeDatabase(); await deleteDB('freewrite');
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
it('requires a remembered existing account and follows account switches', async () => {
  expect(await offlineAccount()).toBeNull(); rememberAccount(a);
  expect(await offlineAccount()).toBeNull(); await claimAccount(a, 'tab-a');
  expect(await offlineAccount()).toBe(a);
  await claimAccount(b, 'tab-b'); rememberAccount(b);
  expect(await offlineAccount()).toBe(b); forgetAccount(a);
  expect(await offlineAccount()).toBe(b);
});
it('never unlocks an expired sign-out or pending cleanup lock', async () => {
  await claimAccount(a, 'tab'); rememberAccount(a);
  await setAccountLock(a, 'tab', true, true);
  const db = await openFreewriteDB(); const locked = (await db.get('meta', a))!;
  await db.put('meta', { ...locked, expires: 0 });
  expect(await offlineAccount()).toBeNull();
  expect(await db.get('meta', a)).toMatchObject({ locked: true, cleanup: true });
  await clearAccount(a); expect(await offlineAccount()).toBeNull();
});
it('forgetting access retains account data and a failed optional cache does not throw', async () => {
  await claimAccount(a, 'tab'); rememberAccount(a); forgetAccount(a);
  expect(await offlineAccount()).toBeNull(); expect(await (await openFreewriteDB()).get('meta', a)).toBeDefined();
  vi.stubGlobal('localStorage', { setItem() { throw Error('blocked'); }, getItem() { throw Error('blocked'); } });
  expect(() => rememberAccount(a)).not.toThrow(); expect(() => forgetAccount(a)).not.toThrow();
});

import { openFreewriteDB } from "./local/indexeddb";

export const OFFLINE_ACCOUNT_KEY = "freewrite:offline-account";
const KEY = OFFLINE_ACCOUNT_KEY;
/** A device-local access policy, never a credential or a server authorization. */
export function rememberAccount(userId: string) { try { localStorage.setItem(KEY, userId); } catch { /* Online writing remains available; offline access fails closed. */ } }
export function forgetAccount(userId: string) { try { if (localStorage.getItem(KEY) === userId) localStorage.removeItem(KEY); } catch { /* The authoritative account lock also denies offline access. */ } }
export function isRememberedAccount(userId: string) { try { return localStorage.getItem(KEY) === userId; } catch { return false; } }
export async function offlineAccount() {
  const id = localStorage.getItem(KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const state = await (await openFreewriteDB()).get("meta", id);
  if (!state || state.locked || state.cleanup || !isRememberedAccount(id)) return null;
  return id;
}

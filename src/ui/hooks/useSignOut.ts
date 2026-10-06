"use client";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { clearAccount, createIndexedDBEntryStore, setAccountLock } from "../../storage/local/indexeddb";
import { clearLocalPreferences } from "../../storage/preferences";
import { safeSignOut } from "../../storage/sign-out";

async function bounded<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error("Saving is taking too long. Keep your writing and retry.")), 10000); })]); }
  finally { clearTimeout(timeout!); }
}
export function useSignOut(options: { userId: string; owner: string | null; flush: () => Promise<void>; flushPreferences: () => Promise<void>; broadcastLock: () => void; suspend: () => void; quiescePreferences: () => void; resumePreferences: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionRemoved, setSessionRemoved] = useState(false);
  async function signOut(discard = false) {
    if (busy || !options.owner) return;
    setBusy(true); setError(null); options.quiescePreferences();
    let locked = false;
    let removed = sessionRemoved;
    try {
      if (removed) { await clearAccount(options.userId); clearLocalPreferences(options.userId); window.location.replace("/sign-in"); return; }
      try { await bounded(options.flush()); } catch (error) { if (!discard) { setConfirm(true); throw error; } }
      const store = createIndexedDBEntryStore(options.userId, options.owner);
      const writing = await store.hasWriting();
      if (writing && !discard) { setConfirm(true); return; }
      try { await bounded(options.flushPreferences()); }
      catch (reason) { if (!discard) { setConfirm(true); throw reason; } }
      // From here no new transaction from another tab can pass its account fence.
      await setAccountLock(options.userId, options.owner, true);
      locked = true;
      options.broadcastLock();
      const result = await safeSignOut({ discard,
        hasUnsyncedWriting: () => store.hasWriting(),
        signOut: async () => {
          const result = await createClient().auth.signOut({ scope: "local" });
          if (!result.error) { removed = true; setSessionRemoved(true); options.suspend(); await setAccountLock(options.userId, options.owner!, true, true); }
          return result;
        },
        cleanup: async () => { await clearAccount(options.userId); clearLocalPreferences(options.userId); },
      });
      if (result === "signed-out") window.location.replace("/sign-in");
    } catch (reason) {
      if (locked && !removed) await setAccountLock(options.userId, options.owner, false).catch(() => {});
      setError(removed ? "Session removed, but local cleanup failed. This account stays locked. Retry cleanup." : `${reason instanceof Error ? reason.message : "Sign-out failed."} Your writing has been retained.`);
    } finally { if (!removed) options.resumePreferences(); setBusy(false); }
  }
  return { signOut, confirm, cancel: () => setConfirm(false), busy, error, sessionRemoved };
}

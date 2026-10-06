"use client";

import { useCallback } from "react";

import { createClient } from "../../lib/supabase/client";
import { createIndexedDBEntryStore } from "../../storage/local/indexeddb";
import { clearLocalPreferences } from "../../storage/preferences";

/**
 * M3 sign-out (§8): wipe only. Flushing the outbox (M4) and empty-entry
 * cleanup (M5) aren't in this yet — neither exists.
 */
export function useSignOut() {
  return useCallback(async () => {
    const supabase = createClient();
    try {
      const entries = await createIndexedDBEntryStore().list();
      // Ownerless v1 data cannot be assigned to this session or safely wiped.
      // The account-partition upgrade will quarantine it non-destructively.
      if (entries.length) {
        window.alert("Local writing is not synced. Sign-out is paused to preserve it. Cancel and keep writing.");
        return;
      }
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      clearLocalPreferences();
      window.location.href = "/sign-in";
    } catch {
      window.alert("Sign-out failed. Your local writing has been retained. Please retry.");
    }
  }, []);
}

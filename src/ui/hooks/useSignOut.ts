"use client";

import { useCallback } from "react";

import { createClient } from "../../lib/supabase/client";
import { clearAllEntries } from "../../storage/local/indexeddb";
import { STORAGE_KEY as PREFS_STORAGE_KEY } from "./usePreferences";

/**
 * M3 sign-out (§8): wipe only. Flushing the outbox (M4) and empty-entry
 * cleanup (M5) aren't in this yet — neither exists.
 */
export function useSignOut() {
  return useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearAllEntries();
    localStorage.removeItem(PREFS_STORAGE_KEY);
    window.location.href = "/sign-in";
  }, []);
}

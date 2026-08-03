"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NEW_ENTRY_BODY } from "../../core/entry";
import { createIndexedDBEntryStore } from "../../storage/local/indexeddb";
import type { Entry, EntryStore } from "../../storage/types";

/**
 * Loop 1 (§7): every keystroke, debounced, writes the full body to IndexedDB.
 * No network — this write cannot fail and survives tab discard.
 */
const LOCAL_SAVE_DEBOUNCE_MS = 250;

/**
 * M2 operates on one implicit entry (§16): open the single row in IndexedDB
 * on boot, or create one if the store is empty. Multi-entry navigation is M5.
 */
export function useEntries() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const storeRef = useRef<EntryStore | null>(null);
  const idRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const store = createIndexedDBEntryStore();
    storeRef.current = store;

    (async () => {
      const metas = await store.list();
      const loaded = metas.length === 0 ? await store.create({ body: NEW_ENTRY_BODY }) : await store.get(metas[0].id);
      if (!cancelled && loaded) {
        idRef.current = loaded.id;
        versionRef.current = loaded.version;
        setEntry(loaded);
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const setBody = useCallback((body: string) => {
    setEntry((current) => (current ? { ...current, body } : current));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const store = storeRef.current;
      const id = idRef.current;
      if (!store || !id) return;
      const updated = await store.update(id, body, versionRef.current);
      versionRef.current = updated.version;
    }, LOCAL_SAVE_DEBOUNCE_MS);
  }, []);

  return { entry, setBody };
}

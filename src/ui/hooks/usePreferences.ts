"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { FontMode, FontSize } from "../../core/fonts";
import type { Theme } from "../../core/theme";
import {
  DEFAULT_PREFERENCES,
  fetchServerPreferences,
  parseStoredPreferences,
  readLocalRaw,
  upsertServerPreferences,
  writeLocalPreferences,
  type Preferences,
} from "../../storage/preferences";

/** §6 sync strategy step 3: debounce upserts rather than one per keystroke-equivalent change. */
const UPSERT_DEBOUNCE_MS = 1000;

// `useSyncExternalStore` requires `getSnapshot` to return a stable reference
// when nothing has changed, so the parsed value is cached against the raw
// string it came from.
let cachedRaw: string | null | undefined;
let cachedPrefs: Preferences = DEFAULT_PREFERENCES;
const listeners = new Set<() => void>();

function getSnapshot(): Preferences {
  const raw = readLocalRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    const stored = parseStoredPreferences(raw);
    cachedPrefs = { theme: stored.theme, font: stored.font, fontSize: stored.fontSize };
  }
  return cachedPrefs;
}

/** Pre-paint value on both the server render and the client's first hydration pass. */
function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function write(prefs: Preferences): string {
  const stored = writeLocalPreferences(prefs);
  cachedRaw = undefined;
  listeners.forEach((listener) => listener());
  return stored.clientUpdatedAt;
}

/**
 * §6 sync strategy: localStorage is the fast path and pre-paint cache
 * (already applied by the root layout's blocking script, M2); this hook adds
 * the boot reconcile (step 2) and the debounced upsert on change (step 3).
 */
export function usePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const upsertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await fetchServerPreferences();
      if (cancelled || !server) return;

      const local = parseStoredPreferences(readLocalRaw());
      if (new Date(server.clientUpdatedAt).getTime() > new Date(local.clientUpdatedAt).getTime()) {
        writeLocalPreferences(
          { theme: server.theme, font: server.font, fontSize: server.fontSize },
          server.clientUpdatedAt,
        );
        cachedRaw = undefined;
        listeners.forEach((listener) => listener());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (upsertTimeoutRef.current) clearTimeout(upsertTimeoutRef.current);
    };
  }, []);

  const scheduleUpsert = useCallback((updated: Preferences, clientUpdatedAt: string) => {
    if (upsertTimeoutRef.current) clearTimeout(upsertTimeoutRef.current);
    upsertTimeoutRef.current = setTimeout(() => {
      upsertServerPreferences(updated, clientUpdatedAt);
    }, UPSERT_DEBOUNCE_MS);
  }, []);

  const setTheme = useCallback(
    (theme: Theme) => {
      const updated = { ...getSnapshot(), theme };
      scheduleUpsert(updated, write(updated));
    },
    [scheduleUpsert],
  );
  const setFont = useCallback(
    (font: FontMode) => {
      const updated = { ...getSnapshot(), font };
      scheduleUpsert(updated, write(updated));
    },
    [scheduleUpsert],
  );
  const setFontSize = useCallback(
    (fontSize: FontSize) => {
      const updated = { ...getSnapshot(), fontSize };
      scheduleUpsert(updated, write(updated));
    },
    [scheduleUpsert],
  );

  return { theme: prefs.theme, font: prefs.font, fontSize: prefs.fontSize, setTheme, setFont, setFontSize };
}

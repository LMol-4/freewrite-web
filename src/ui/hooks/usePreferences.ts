"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_FONT_MODE, DEFAULT_FONT_SIZE, FONT_MODES, FONT_SIZES, type FontMode, type FontSize } from "../../core/fonts";
import { DEFAULT_THEME, THEMES, type Theme } from "../../core/theme";

/**
 * §6 preferences: one `localStorage` key holding a small JSON object, not
 * four loose keys, so a reconcile (arriving in M3) has one `clientUpdatedAt`
 * to compare against.
 */
export const STORAGE_KEY = "freewrite:prefs";

interface Preferences {
  theme: Theme;
  font: FontMode;
  fontSize: FontSize;
}

interface StoredPrefs extends Preferences {
  clientUpdatedAt: string;
}

// A stable reference: `useSyncExternalStore` treats a new object identity as
// a change, so a function recreating this on every call causes a render loop.
const DEFAULT_PREFS: Preferences = { theme: DEFAULT_THEME, font: DEFAULT_FONT_MODE, fontSize: DEFAULT_FONT_SIZE };

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

function isFontMode(value: unknown): value is FontMode {
  return typeof value === "string" && (FONT_MODES as readonly string[]).includes(value);
}

function isFontSize(value: unknown): value is FontSize {
  return typeof value === "number" && (FONT_SIZES as readonly number[]).includes(value);
}

/** Falls back to defaults on anything malformed, rather than throwing before paint. */
function parse(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_THEME,
      font: isFontMode(parsed.font) ? parsed.font : DEFAULT_FONT_MODE,
      fontSize: isFontSize(parsed.fontSize) ? parsed.fontSize : DEFAULT_FONT_SIZE,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// `useSyncExternalStore` requires `getSnapshot` to return a stable reference
// when nothing has changed, so the parsed value is cached against the raw
// string it came from.
let cachedRaw: string | null | undefined;
let cachedPrefs: Preferences = DEFAULT_PREFS;
const listeners = new Set<() => void>();

function getSnapshot(): Preferences {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parse(raw);
  }
  return cachedPrefs;
}

/** Pre-paint value on both the server render and the client's first hydration pass. */
function getServerSnapshot(): Preferences {
  return DEFAULT_PREFS;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function write(prefs: Preferences) {
  const stored: StoredPrefs = { ...prefs, clientUpdatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  cachedRaw = undefined;
  listeners.forEach((listener) => listener());
}

/**
 * Local-only for M2 (§16): reads/writes the `freewrite:prefs` cache. Server
 * reconcile (§6 sync strategy step 2) arrives in M3.
 */
export function usePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((theme: Theme) => write({ ...getSnapshot(), theme }), []);
  const setFont = useCallback((font: FontMode) => write({ ...getSnapshot(), font }), []);
  const setFontSize = useCallback((fontSize: FontSize) => write({ ...getSnapshot(), fontSize }), []);

  return { theme: prefs.theme, font: prefs.font, fontSize: prefs.fontSize, setTheme, setFont, setFontSize };
}

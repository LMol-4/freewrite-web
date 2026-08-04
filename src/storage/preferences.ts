import { DEFAULT_FONT_MODE, DEFAULT_FONT_SIZE, FONT_MODES, FONT_SIZES, type FontMode, type FontSize } from "../core/fonts";
import { DEFAULT_THEME, THEMES, type Theme } from "../core/theme";
import { createClient } from "../lib/supabase/client";

/**
 * §6 preferences: one localStorage key holding a small JSON object, not four
 * loose keys, so the reconcile below has one `clientUpdatedAt` to compare.
 */
export const PREFS_STORAGE_KEY = "freewrite:prefs";

export interface Preferences {
  theme: Theme;
  font: FontMode;
  fontSize: FontSize;
}

export interface StoredPreferences extends Preferences {
  clientUpdatedAt: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: DEFAULT_THEME,
  font: DEFAULT_FONT_MODE,
  fontSize: DEFAULT_FONT_SIZE,
};

/** Older than anything real, so a missing/malformed local cache always loses to the server. */
const EPOCH = new Date(0).toISOString();

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
export function parseStoredPreferences(raw: string | null): StoredPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES, clientUpdatedAt: EPOCH };
  try {
    const parsed = JSON.parse(raw);
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_THEME,
      font: isFontMode(parsed.font) ? parsed.font : DEFAULT_FONT_MODE,
      fontSize: isFontSize(parsed.fontSize) ? parsed.fontSize : DEFAULT_FONT_SIZE,
      clientUpdatedAt: typeof parsed.clientUpdatedAt === "string" ? parsed.clientUpdatedAt : EPOCH,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, clientUpdatedAt: EPOCH };
  }
}

export function readLocalRaw(): string | null {
  return localStorage.getItem(PREFS_STORAGE_KEY);
}

export function readLocalPreferences(): StoredPreferences {
  return parseStoredPreferences(readLocalRaw());
}

export function writeLocalPreferences(
  prefs: Preferences,
  clientUpdatedAt: string = new Date().toISOString(),
): StoredPreferences {
  const stored: StoredPreferences = { ...prefs, clientUpdatedAt };
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export function clearLocalPreferences(): void {
  localStorage.removeItem(PREFS_STORAGE_KEY);
}

interface PreferencesRow {
  theme: string;
  font: string;
  font_size: number;
  client_updated_at: string;
}

/** Every account has a row from the instant it's created (§6 `handle_new_user` trigger). */
export async function fetchServerPreferences(): Promise<StoredPreferences | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("preferences")
    .select("theme, font, font_size, client_updated_at")
    .maybeSingle();

  if (error || !data) return null;

  const row = data as PreferencesRow;
  return {
    theme: isTheme(row.theme) ? row.theme : DEFAULT_THEME,
    font: isFontMode(row.font) ? row.font : DEFAULT_FONT_MODE,
    fontSize: isFontSize(row.font_size) ? row.font_size : DEFAULT_FONT_SIZE,
    clientUpdatedAt: row.client_updated_at,
  };
}

/** §6 sync strategy step 3. The row always exists already, so this is always an update. */
export async function upsertServerPreferences(prefs: Preferences, clientUpdatedAt: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;

  await supabase.from("preferences").upsert({
    user_id: userId,
    theme: prefs.theme,
    font: prefs.font,
    font_size: prefs.fontSize,
    client_updated_at: clientUpdatedAt,
  });
}

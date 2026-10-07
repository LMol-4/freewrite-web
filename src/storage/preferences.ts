import { DEFAULT_FONT_MODE, DEFAULT_FONT_SIZE, FONT_MODES, FONT_SIZES, type FontMode, type FontSize } from "../core/fonts";
import { DEFAULT_THEME, THEMES, type Theme } from "../core/theme";
import { checkFence, openFreewriteDB } from "./local/indexeddb";
export interface Preferences { theme: Theme; font: FontMode; fontSize: FontSize }
export const DEFAULT_PREFERENCES: Preferences = { theme: DEFAULT_THEME, font: DEFAULT_FONT_MODE, fontSize: DEFAULT_FONT_SIZE };
export interface PreferenceState {
  userId: string; values: Preferences; version: number; generation: number;
  pending: Partial<Preferences>; fields: Partial<Record<keyof Preferences, number>>;
}
export const ACTIVE_THEME_KEY = "freewrite:active-theme";
export function parseStoredPreferences(raw: string | null) {
  let p: Record<string, unknown> = {};
  try { const value = JSON.parse(raw ?? "null"); if (value && typeof value === "object") p = value; } catch {}
  return { theme: THEMES.includes(p.theme as Theme) ? p.theme as Theme : DEFAULT_THEME,
    font: FONT_MODES.includes(p.font as FontMode) ? p.font as FontMode : DEFAULT_FONT_MODE,
    fontSize: FONT_SIZES.includes(p.fontSize as FontSize) ? p.fontSize as FontSize : DEFAULT_FONT_SIZE,
    clientUpdatedAt: typeof p.clientUpdatedAt === "string" && Number.isFinite(Date.parse(p.clientUpdatedAt)) ? p.clientUpdatedAt : new Date(0).toISOString() };
}
export function cacheTheme(userId: string, theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#1e1e1e" : "#ffffff");
  try { localStorage.setItem(ACTIVE_THEME_KEY, JSON.stringify({ userId, theme })); } catch { /* IDB is authoritative; this cache is optional. */ }
}
export function clearLocalPreferences(userId: string) {
  try { const cached = JSON.parse(localStorage.getItem(ACTIVE_THEME_KEY) ?? "null"); if (!cached || cached.userId === userId) localStorage.removeItem(ACTIVE_THEME_KEY); } catch {}
}
export function emptyPreferences(userId: string): PreferenceState { return { userId, values: { ...DEFAULT_PREFERENCES }, version: 0, generation: 0, pending: {}, fields: {} }; }
export async function readPreferences(userId: string) { return (await (await openFreewriteDB()).get("preferences", userId)) ?? emptyPreferences(userId); }
export async function patchPreferences(userId: string, owner: string, patch: Partial<Preferences>) {
  const db = await openFreewriteDB();
  const tx = db.transaction(["preferences", "meta"], "readwrite");
  try {
    await checkFence(tx, userId, owner);
    const current = (await tx.objectStore("preferences").get(userId)) ?? emptyPreferences(userId);
    current.generation++;
    current.values = { ...current.values, ...patch };
    current.pending = { ...current.pending, ...patch };
    for (const key of Object.keys(patch) as (keyof Preferences)[]) current.fields[key] = current.generation;
    await tx.objectStore("preferences").put(current); await tx.done; return current;
  } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw error; }
}
export interface ServerPreferences { values: Preferences; version: number }
export interface PreferenceRemote { fetch(): Promise<ServerPreferences>; publish(version: number, patch: Partial<Preferences>): Promise<ServerPreferences | null> }
/** Persisted patches are retried on boot, focus, online and a bounded backoff. Device clocks never order writes. */
export class PreferenceSync {
  private running: Promise<void> | null = null;
  constructor(private userId: string, private owner: string, private remote: PreferenceRemote, private changed: () => void) {}
  flush() { return this.running ??= this.drain().finally(() => { this.running = null; }); }
  async settled() { await this.running?.catch(() => {}); }
  private async reconcile(server: ServerPreferences, sent?: PreferenceState) {
    const db = await openFreewriteDB();
    const tx = db.transaction(["preferences", "meta"], "readwrite");
    try {
      await checkFence(tx, this.userId, this.owner);
      const current = (await tx.objectStore("preferences").get(this.userId)) ?? emptyPreferences(this.userId);
      if (sent) for (const key of Object.keys(sent.pending) as (keyof Preferences)[]) {
        if (current.fields[key] === sent.fields[key]) { delete current.pending[key]; delete current.fields[key]; }
      }
      current.version = server.version;
      current.values = { ...server.values, ...current.pending };
      await tx.objectStore("preferences").put(current); await tx.done; this.changed();
    } catch (error) { try { tx.abort(); } catch {} await tx.done.catch(() => {}); throw error; }
  }
  private async drain() {
    await this.reconcile(await this.remote.fetch());
    for (let attempt = 0; attempt < 8; attempt++) {
      const snapshot = await readPreferences(this.userId);
      if (!Object.keys(snapshot.pending).length) return;
      const result = await this.remote.publish(snapshot.version, snapshot.pending);
      await this.reconcile(result ?? await this.remote.fetch(), result ? snapshot : undefined);
    }
    throw Error("Preferences changed elsewhere. Retrying shortly.");
  }
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { cacheTheme, DEFAULT_PREFERENCES, patchPreferences, PreferenceSync, readPreferences, type Preferences } from "../../storage/preferences";
import type { FontMode, FontSize } from "../../core/fonts";
import type { Theme } from "../../core/theme";

export function usePreferences(userId: string, owner: string | null, enabled: boolean) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFERENCES);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading preferences…");
  const pending = useRef<Partial<Preferences>>({});
  const inFlight = useRef<Partial<Preferences>>({});
  const local = useRef<Promise<void> | null>(null);
  const sync = useRef<PreferenceSync | null>(null);
  const schedule = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const paused = useRef(false);
  const retryRemote = useRef<() => void>(() => {});
  const refresh = useCallback(async () => {
    const state = await readPreferences(userId);
    if (!active.current) return;
    if (!owner && state.version === 0 && !Object.keys(state.pending).length) return;
    const values = { ...state.values, ...inFlight.current, ...pending.current };
    setPrefs(values); cacheTheme(userId, values.theme);
    const volatile = Object.keys(inFlight.current).length || Object.keys(pending.current).length;
    setStatus(volatile ? "Preferences not yet saved on this device" : Object.keys(state.pending).length ? "Preferences pending" : "Preferences synced");
  }, [userId, owner]);
  const flushLocal = useCallback(async () => {
    if (local.current) return local.current;
    local.current = (async () => {
      while (Object.keys(pending.current).length) {
        if (!owner) throw Error("Preferences are locked");
        const patch = pending.current; pending.current = {}; inFlight.current = patch;
        try { await patchPreferences(userId, owner, patch); }
        catch (reason) { pending.current = { ...patch, ...pending.current }; throw reason; }
        finally { inFlight.current = {}; }
      }
      await refresh();
    })().finally(() => { local.current = null; });
    return local.current;
  }, [userId, owner, refresh]);
  const flush = useCallback(async () => { await flushLocal(); await sync.current?.flush(); }, [flushLocal]);
  const settle = useCallback(async () => { await local.current?.catch(() => {}); await sync.current?.settled(); }, []);
  useEffect(() => {
    active.current = enabled;
    if (!enabled) return;
    let retry = 1000;
    let cancelled = false;
    const run = async () => {
      if (paused.current || cancelled) return;
      try { await flush(); if (!cancelled) { setError(null); retry = 1000; } }
      catch { if (!cancelled) {
        setError(Object.keys(pending.current).length ? "Preferences could not be saved on this device. Retrying; keep this tab open." : "Preferences could not sync. Changes are kept on this device; retrying.");
        schedule.current = setTimeout(() => { void run(); }, retry); retry = Math.min(30000, retry * 2);
      } }
    };
    retryRemote.current = () => { void run(); };
    if (owner) {
      const supabase = createClient();
      const authorize = async () => { const { data, error } = await supabase.auth.getUser(); if (error || data.user?.id !== userId) throw Error("Sign in online to sync preferences."); };
      sync.current = new PreferenceSync(userId, owner, {
        async fetch() {
          await authorize();
          const { data, error } = await supabase.rpc("get_preferences");
          if (error || !data?.[0]) throw error ?? Error("Preferences unavailable");
          const row = data[0];
          if (row.user_id !== userId) throw Error("Account changed");
          return { version: row.version, values: { theme: row.theme as Theme, font: row.font as FontMode, fontSize: row.font_size as FontSize } };
        },
        async publish(version, patch) {
          await authorize();
          const { data, error } = await supabase.rpc("publish_preferences", { requested_user_id: userId, expected_version: version, patch });
          if (error) throw error;
          const row = data?.[0];
          return row ? { version: row.version, values: { theme: row.theme as Theme, font: row.font as FontMode, fontSize: row.font_size as FontSize } } : null;
        },
      }, () => { void refresh().catch(() => {}); });
    }
    void refresh().then(run).catch(() => setError("Local preferences unavailable. Please retry."));
    const wake = () => { if (document.visibilityState !== "hidden") void run(); };
    window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => { cancelled = true; active.current = false; if (schedule.current) clearTimeout(schedule.current); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); sync.current = null; };
  }, [userId, owner, enabled, refresh, flush]);
  const patch = useCallback((value: Partial<Preferences>) => {
    if (!owner || !active.current || paused.current) return;
    pending.current = { ...pending.current, ...value };
    setPrefs(current => ({ ...current, ...value }));
    if (value.theme) cacheTheme(userId, value.theme);
    setStatus("Saving preferences on this device");
    void flushLocal().catch(() => setError("Preferences could not be saved on this device. Retrying; keep this tab open."));
    if (schedule.current) clearTimeout(schedule.current);
    schedule.current = setTimeout(() => retryRemote.current(), 1000);
  }, [userId, owner, flushLocal]);
  return { ...prefs, error, status, flush, settle,
    quiesce: () => { paused.current = true; if (schedule.current) clearTimeout(schedule.current); },
    resume: () => { paused.current = false; },
    setTheme: (theme: Theme) => patch({ theme }), setFont: (font: FontMode) => patch({ font }), setFontSize: (fontSize: FontSize) => patch({ fontSize }) };
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createIndexedDBEntryStore, openFreewriteDB, resumeAccount, type LocalEntry } from "../../storage/local/indexeddb";
import { coordinateAccount } from "../../storage/local/coordinator";
import { LocalSaveQueue } from "../../storage/local/save-queue";
import { VersionConflictError } from "../../storage/types";
import { createClient } from "../../lib/supabase/client";
import { createRemoteEntryStore } from "../../storage/remote/entries";
import { createJournal } from "../../storage/sync/journal";
import { EntrySync } from "../../storage/sync/engine";

export function useEntries(userId: string) {
  const [entry, setEntry] = useState<LocalEntry | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState("Opening local writing…");
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [legacyCount, setLegacyCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Waiting to sync");
  const [notice, setNotice] = useState<string | null>(null);
  const sync = useRef<EntrySync | null>(null);
  const paused = useRef(false);
  const signingOut = useRef(false);
  const buffer = useRef("");
  const queue = useRef<LocalSaveQueue | null>(null);
  const active = useRef(true);
  const current = useRef<LocalEntry | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const suspend = useCallback(() => { active.current = false; sync.current?.stop(); setReadOnly(true); }, []);
  useEffect(() => {
    let cancelled = false;
    let close = async () => {};
    let sessionQueue: LocalSaveQueue | null = null;
    let committed: LocalEntry | null = null;
    let engine: EntrySync | null = null;
    active.current = true;
    const changed = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`freewrite:${userId}`) : null;
    channel.current = changed;
    const fail = (reason: unknown) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "Local storage failed. Keep this text and retry."); } };
    const refresh = async () => {
      if (queue.current?.unsaved || !current.current) return;
      const latest = await (await openFreewriteDB()).get("entries", [userId, current.current.id]);
      if (!cancelled && active.current && latest && !queue.current?.unsaved) { committed = latest; current.current = latest; buffer.current = latest.body ?? ""; setEntry(latest); }
    };
    if (changed) changed.onmessage = event => {
      if (event.data === "lock") { suspend(); setStatus("This account was locked in another tab. Sign in again to continue."); }
      else void refresh().catch(fail);
    };
    const upgrade = () => { suspend(); setError("Storage changed in another tab. Copy any unsaved text, then reload."); };
    window.addEventListener("freewrite:reload-required", upgrade);
    void (async () => {
      await resumeAccount(userId);
      const coordinator = await coordinateAccount(userId, () => { suspend(); setError("This tab lost its writing lock. Copy any unsaved text, then reload."); });
      if (coordinator) close = coordinator.close;
      if (cancelled) { await close(); return; }
      const db = await openFreewriteDB();
      setLegacyCount(await db.count("legacy"));
      if (!coordinator) {
        const entries = await db.getAllFromIndex("entries", "account", userId);
        const loaded = entries.filter(e => !e.recovered).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (loaded) { current.current = loaded; setEntry(loaded); }
        setStatus("Read-only: another tab is writing. Close that tab, then reload here.");
        return;
      }
      const store = createIndexedDBEntryStore(userId, coordinator.owner);
      const loaded = await store.ensureEntry();
      if (cancelled || !active.current) return;
      committed = loaded; current.current = loaded; buffer.current = loaded.body ?? ""; setEntry(loaded); setOwner(coordinator.owner); setReadOnly(false); setStatus("Saved on this device");
      sessionQueue = new LocalSaveQueue(async body => {
        const existing = committed!;
        try { committed = await store.update(existing.id, body, existing.localGeneration); }
        catch (reason) {
          if (reason instanceof VersionConflictError) {
            const recovered = await store.recover(body);
            committed = recovered;
            if (!cancelled) setError("This entry changed in another tab. Your text was preserved separately on this device.");
          } else throw reason;
        }
        if (!cancelled) { current.current = committed; changed?.postMessage("changed"); }
        engine?.schedule();
      }, (state, reason) => {
        if (cancelled || !active.current) return;
        setStatus(state === "saved" ? "Saved on this device" : state === "saving" ? "Saving on this device" : "Not saved on this device");
        if (state === "error") fail(reason);
      });
      queue.current = sessionQueue;
      const journal = createJournal(userId, coordinator.owner);
      const remote = createRemoteEntryStore(createClient(), userId, () => !cancelled && active.current);
      const changedEntry = async () => {
        if (cancelled || !active.current || queue.current?.unsaved) return;
        const all = await journal.entries();
        let latest = all.find(e => e.id === committed?.id);
        // Replace only an untouched local scratch slot with the newest discovered normal entry.
        if ((!latest || latest.deleted || latest.recovered || (latest.baseServerVersion === null && !buffer.current.trim())) && !queue.current?.unsaved) {
          latest = all.filter(e => !e.deleted && !e.recovered && e.baseServerVersion !== null).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? latest;
        }
        if (!latest || latest.deleted || latest.recovered) latest = await store.ensureEntry();
        if (latest.body === null) {
          const row = await remote.get(latest.id);
          if (row && !row.deleted_at) { const body = await remote.body(row); await journal.adopt(row, body, latest.localGeneration); latest = (await store.get(latest.id))!; }
        }
        if (cancelled || !active.current || queue.current?.unsaved) return;
        // A local edit completed during the fetch: never replace its newer buffer.
        if (latest.id === current.current?.id && latest.localGeneration < current.current.localGeneration) return;
        if (current.current?.dirty && buffer.current.trim() && latest.id !== current.current.id && !paused.current) return;
        committed = latest; current.current = latest; buffer.current = latest.body ?? ""; setEntry(latest);
        changed?.postMessage("changed");
      };
      engine = new EntrySync(journal, remote, {
        active: () => !cancelled && active.current,
        selected: () => current.current?.id,
        changed: changedEntry,
        quiesce: async () => { paused.current = true; setReadOnly(true); await sessionQueue?.flush(); },
        resume: () => { paused.current = signingOut.current; if (!cancelled && active.current) setReadOnly(false); },
        status: value => { if (!cancelled && active.current) setSyncStatus(value); },
        notice: value => { if (!cancelled && active.current) setNotice(value); },
      });
      sync.current = engine;
      void engine.flush(true).catch(() => {});
      void navigator.storage?.persist?.().catch(() => {});
    })().catch(fail);
    const flush = () => { void sessionQueue?.flush().catch(fail).then(() => signingOut.current ? undefined : engine?.flush()).catch(() => {}); };
    const wake = () => { if (!signingOut.current && document.visibilityState !== "hidden") void sessionQueue?.flush().then(() => engine?.flush(true, true)).catch(() => {}); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => { cancelled = true; active.current = false; engine?.stop(); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); window.removeEventListener("freewrite:reload-required", upgrade); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); changed?.close(); void (async () => { try { await sessionQueue?.flush(); } finally { await close(); } })().catch(() => {}); };
  }, [userId, suspend]);
  const setBody = useCallback((body: string) => {
    if (!active.current || paused.current || !queue.current) return;
    buffer.current = body;
    setEntry(value => value ? { ...value, body } : value);
    queue.current.request(body);
  }, []);
  const flush = useCallback(async () => { await queue.current?.flush(); }, []);
  const flushRemote = useCallback(async () => { await queue.current?.flush(); await sync.current?.flush(true, true); }, []);
  const settle = useCallback(async () => { await sync.current?.settled(); }, []);
  const retry = useCallback(async () => { if (!queue.current) { window.location.reload(); return; } try { await flush(); setError(null); } catch {} }, [flush]);
  return { entry, setBody, owner, status, syncStatus, notice, dismissNotice: () => setNotice(null), error, readOnly, legacyCount, flush, flushRemote, settle, retry, suspend,
    quiesce: () => { paused.current = true; signingOut.current = true; sync.current?.pauseScheduling(); },
    resume: () => { paused.current = false; signingOut.current = false; sync.current?.resumeScheduling(); },
    broadcastLock: () => channel.current?.postMessage("lock") };
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createIndexedDBEntryStore, openFreewriteDB, resumeAccount, type LocalEntry } from "../../storage/local/indexeddb";
import { coordinateAccount } from "../../storage/local/coordinator";
import { LocalSaveQueue } from "../../storage/local/save-queue";
import { VersionConflictError } from "../../storage/types";

export function useEntries(userId: string) {
  const [entry, setEntry] = useState<LocalEntry | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState("Opening local writing…");
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [legacyCount, setLegacyCount] = useState(0);
  const queue = useRef<LocalSaveQueue | null>(null);
  const active = useRef(true);
  const current = useRef<LocalEntry | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const suspend = useCallback(() => { active.current = false; setReadOnly(true); }, []);
  useEffect(() => {
    let cancelled = false;
    let close = async () => {};
    let sessionQueue: LocalSaveQueue | null = null;
    let committed: LocalEntry | null = null;
    active.current = true;
    const changed = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`freewrite:${userId}`) : null;
    channel.current = changed;
    const fail = (reason: unknown) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "Local storage failed. Keep this text and retry."); } };
    const refresh = async () => {
      if (queue.current?.unsaved || !current.current) return;
      const latest = await (await openFreewriteDB()).get("entries", [userId, current.current.id]);
      if (!cancelled && active.current && latest) { current.current = latest; setEntry(latest); }
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
      committed = loaded; current.current = loaded; setEntry(loaded); setOwner(coordinator.owner); setReadOnly(false); setStatus("Saved on this device");
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
      }, (state, reason) => {
        if (cancelled || !active.current) return;
        setStatus(state === "saved" ? "Saved on this device" : state === "saving" ? "Saving on this device" : "Not saved on this device");
        if (state === "error") fail(reason);
      });
      queue.current = sessionQueue;
      void navigator.storage?.persist?.().catch(() => {});
    })().catch(fail);
    const flush = () => { void sessionQueue?.flush().catch(fail); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelled = true; active.current = false; window.removeEventListener("freewrite:reload-required", upgrade); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); changed?.close(); void (async () => { try { await sessionQueue?.flush(); } finally { await close(); } })().catch(() => {}); };
  }, [userId, suspend]);
  const setBody = useCallback((body: string) => {
    if (!active.current || !queue.current) return;
    setEntry(value => value ? { ...value, body } : value);
    queue.current.request(body);
  }, []);
  const flush = useCallback(async () => { await queue.current?.flush(); }, []);
  const retry = useCallback(async () => { if (!queue.current) { window.location.reload(); return; } try { await flush(); setError(null); } catch {} }, [flush]);
  return { entry, setBody, owner, status, error, readOnly, legacyCount, flush, retry, suspend, broadcastLock: () => channel.current?.postMessage("lock") };
}

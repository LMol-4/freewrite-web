"use client";

import { useEffect, useRef, useState } from "react";

import { otherTheme } from "@/src/core/theme";
import { Editor } from "@/src/ui/components/Editor";
import { useFontControlItems } from "@/src/ui/components/FontControls";
import { SignOutButton } from "@/src/ui/components/SignOutButton";
import { ThemeToggle } from "@/src/ui/components/ThemeToggle";
import { TimerButton } from "@/src/ui/components/TimerButton";
import { Toolbar } from "@/src/ui/components/Toolbar";
import { useEntries } from "@/src/ui/hooks/useEntries";
import { usePreferences } from "@/src/ui/hooks/usePreferences";
import { useSignOut } from "@/src/ui/hooks/useSignOut";
import { useTimer } from "@/src/ui/hooks/useTimer";
import { createClient } from "@/src/lib/supabase/client";
import { clearLocalPreferences } from "@/src/storage/preferences";
import { ConfirmDialog } from "./ConfirmDialog";
import { HistoryPanel } from "./HistoryPanel";
import { ChatControl } from "./ChatControl";
import type { LocalEntry } from "../../storage/local/indexeddb";

export function Writer({ userId, initialPlaceholder }: { userId: string; initialPlaceholder: string }) {
  const entries = useEntries(userId);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleting, setDeleting] = useState<LocalEntry | null>(null);
  const { entry, setBody } = entries;
  const [authenticated, setAuthenticated] = useState(true);
  const preferences = usePreferences(userId, entries.owner, authenticated);
  const { theme, font, fontSize, setTheme, setFont, setFontSize } = preferences;
  const timer = useTimer();
  const signOut = useSignOut({ userId, owner: entries.owner, flush: entries.flush, flushRemote: entries.flushRemote, settle: entries.settle, quiesce: entries.quiesce, resume: entries.resume, flushPreferences: preferences.flush, settlePreferences: preferences.settle, broadcastLock: entries.broadcastLock, suspend: entries.suspend, quiescePreferences: preferences.quiesce, resumePreferences: preferences.resume });
  const placeholder = initialPlaceholder;
  const { suspend } = entries;
  const { flushRemote } = entries;
  const { flush: flushPreferences } = preferences;
  const syncDisabled = entries.readOnly || !authenticated || signOut.busy || signOut.confirm || entries.busy || !!deleting;
  function focusEditor() { requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("textarea.editor")?.focus()); }
  async function openEntry(id: string) { try { await entries.openEntry(id); setHistoryOpen(false); focusEditor(); } catch {} }
  async function newEntry() { try { await entries.newEntry(); setHistoryOpen(false); focusEditor(); } catch {} }
  async function prepareDelete(id: string, button: HTMLButtonElement) {
    deleteRef.current = button;
    try { setDeleting(await entries.prepareDelete(id)); } catch {}
  }
  async function deleteEntry() {
    if (!deleting) return;
    try { await entries.deleteEntry(deleting); setDeleting(null); requestAnimationFrame(() => historyRef.current?.focus()); } catch {}
  }

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault(); if (!syncDisabled) void Promise.all([flushRemote(), flushPreferences()]).catch(() => {});
      }
    };
    window.addEventListener("keydown", save); return () => window.removeEventListener("keydown", save);
  }, [flushRemote, flushPreferences, syncDisabled]);


  useEffect(() => {
    const client = createClient();
    const identities = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("freewrite:identity") : null;
    const invalidate = () => { suspend(); setAuthenticated(false); clearLocalPreferences(userId); };
    if (identities) { identities.onmessage = event => { if (event.data !== userId) invalidate(); }; identities.postMessage(userId); }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session) || (session && session.user.id !== userId)) invalidate();
    });
    const check = () => { void client.auth.getUser().then(({ data, error }) => {
      if (data.user && data.user.id !== userId) invalidate();
      // Network failure is not proof of sign-out; keep the local partition.
      if (!data.user && error && (error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError")) invalidate();
    }); };
    window.addEventListener("pageshow", check); window.addEventListener("focus", check);
    return () => { identities?.close(); data.subscription.unsubscribe(); window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); };
  }, [userId, suspend]);

  const fontControls = useFontControlItems({
    fontMode: font,
    fontSize,
    onFontModeChange: setFont,
    onFontSizeChange: setFontSize,
  });

  return (
    <div className={`app-container${historyOpen ? " history-visible" : ""}`}>
      <div className="main-content">
        {!authenticated && <p role="alert">Your session changed. Local writing is retained. <a href="/sign-in">Sign in again</a>.</p>}
        {entries.legacyCount > 0 && <p role="status">{entries.legacyCount} legacy entries are preserved separately. Their account ownership needs to be decided before import.</p>}
        <p role="status" aria-live="polite">{entries.status}</p>
        <p><span role="status" aria-live="polite">{entries.syncStatus === "Entries synced" && preferences.status === "Preferences synced" && entries.status === "Saved on this device" ? "Synced" : entries.syncStatus}</span>{" "}
          <button type="button" disabled={syncDisabled} onClick={() => void Promise.all([entries.flushRemote(), preferences.flush()]).catch(() => {})}>Sync now</button>
        </p>
        {entries.notice && <p role="status">{entries.notice} <button type="button" onClick={entries.dismissNotice}>Dismiss</button></p>}
        {entries.actionError && !deleting && <p role="alert">{entries.actionError} <button type="button" onClick={entries.dismissActionError}>Dismiss</button></p>}
        {entries.error && <p role="alert">{entries.error} <button type="button" onClick={() => void entries.retry()}>Retry local save</button> Keep the text available to copy.</p>}
        {preferences.error && <p role="alert">{preferences.error} <button type="button" onClick={() => void preferences.flush().catch(() => {})}>Retry preferences</button></p>}
        <span role="status">{preferences.status}</span>
        {signOut.error && <p role="alert">{signOut.error} {signOut.sessionRemoved && <button type="button" onClick={() => void signOut.signOut(true)}>Retry cleanup</button>}</p>}
        {entry?.body === null && <p role="alert">This entry is not downloaded. Reconnect and retry sync to open it.</p>}
        {entry?.recovered && authenticated && <p role="status">Recovered copy · Read-only. <button type="button" disabled={syncDisabled} onClick={() => void entries.restoreEntry().then(focusEditor).catch(() => {})}>Restore as new entry</button></p>}
        {entry && entry.body !== null && authenticated && (
          <Editor
            value={entry.body}
            onChange={setBody}
            placeholder={placeholder}
            fontFamily={fontControls.fontFamily}
            fontSize={fontSize}
            faded={timer.status === "complete"}
            readOnly={syncDisabled || entry.recovered}
          />
        )}
        <fieldset disabled={syncDisabled} style={{ border: 0, padding: 0, margin: 0 }}><Toolbar
          leftControls={fontControls.items}
          rightControls={[
            entry && entry.body !== null && authenticated && <ChatControl key={entry.id} body={entry.body} />,
            <TimerButton key="timer" label={timer.label} onClick={timer.toggle} />,
            <ThemeToggle key="theme" theme={theme} onToggle={() => setTheme(otherTheme(theme))} />,
            <button type="button" className="control-item" key="new" aria-label="New entry" onClick={() => void newEntry()}>+</button>,
            <button type="button" className="control-item" key="history" ref={historyRef} aria-label="History" aria-expanded={historyOpen} aria-controls="entry-history" onClick={() => setHistoryOpen(value => !value)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </button>,
            <SignOutButton buttonRef={signOutRef} key="sign-out" onClick={() => void signOut.signOut()} />,
          ]}
        /></fieldset>
        {deleting && <ConfirmDialog title="Delete entry?" openerRef={deleteRef} onCancel={() => { if (!entries.busy) setDeleting(null); }}>
          <p>This removes the entry from your history and queues its deletion from the cloud. Recovered copies are separate.</p>
          <p>{deleting.previewText || "Empty entry"}</p>
          {entries.actionError && <p role="alert">{entries.actionError}</p>}
          <button type="button" autoFocus disabled={entries.busy} onClick={() => setDeleting(null)}>Cancel</button>
          <button type="button" disabled={entries.busy} onClick={() => void deleteEntry()}>Delete entry</button>
        </ConfirmDialog>}
        {signOut.confirm && <ConfirmDialog openerRef={signOutRef} onCancel={signOut.busy ? () => {} : signOut.cancel}>
          {signOut.error && <p role="alert">{signOut.error}</p>}
          <p>Some changes could not be synced. Discarding removes this account’s unsynced writing and preference changes from this browser. It cannot undo changes already saved remotely.</p>
          <button type="button" autoFocus onClick={signOut.cancel} disabled={signOut.busy}>Cancel</button>
          <button type="button" onClick={() => void signOut.signOut(true)} disabled={signOut.busy}>Discard local writing and sign out</button>
        </ConfirmDialog>}
      </div>
      {historyOpen && authenticated && <HistoryPanel entries={entries.history} selectedId={entry?.id} disabled={syncDisabled}
        onOpen={id => void openEntry(id)} onNew={() => void newEntry()} onDelete={(id, button) => void prepareDelete(id, button)}
        onClose={() => setHistoryOpen(false)} openerRef={historyRef} />}
    </div>
  );
}

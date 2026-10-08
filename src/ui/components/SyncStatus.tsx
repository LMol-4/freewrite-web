"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Props {
  local: string;
  remote: string;
  preferences: string;
  preferenceError: string | null;
  localError: boolean;
  readiness: string;
  disabled: boolean;
  onSync: () => void;
  onRetryPreferences: () => void;
}

export function SyncStatus(props: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const problem = props.localError || !!props.preferenceError || /^(Sync error:|Sign in again|Offline)/.test(props.remote);
  const synced = !problem && props.local === "Saved on this device" && props.remote === "Entries synced" && props.preferences === "Preferences synced";
  const syncing = !problem && (props.remote === "Syncing…" || props.local === "Saving on this device");
  const summary = problem ? "Sync needs attention" : synced ? "Synced" : syncing ? "Syncing" : "Changes waiting to sync";
  const detail = props.localError ? props.local
    : props.preferenceError ? props.preferenceError
    : problem ? props.remote
    : synced ? "Synced"
    : syncing ? "Saving…"
    : props.local !== "Saved on this device" ? (props.local || props.remote)
    : "Saved on this device · sync pending";

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  return <div ref={root} className="sync-status" data-local={props.local} data-preferences={props.preferences} data-readiness={props.readiness} data-state={problem ? "attention" : synced ? "synced" : syncing ? "syncing" : "pending"}>
    <button ref={button} type="button" className="sync-indicator" aria-label="Sync status" aria-describedby={`${id}-summary`} title={summary}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <svg className={syncing ? "sync-spinning" : undefined} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {synced ? <><path d="M20 7 10 17l-5-5" /></> : <><path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5" /></>}
      </svg>
      {problem && <span className="sync-attention" aria-hidden="true">!</span>}
      <span id={`${id}-summary`} className="visually-hidden">Status: {summary}</span>
    </button>
    {/* Keep save feedback available to assistive technology without occupying
        the writing canvas. Actions enter the tab order only when expanded. */}
    <div id={id} className={open ? "sync-panel" : "visually-hidden"}>
      <p role="status" title={props.readiness}>{detail}</p>
      {open && <div className="sync-actions">
        <button type="button" disabled={props.disabled} onClick={props.onSync}>Sync now</button>
        {props.preferenceError && <button type="button" disabled={props.disabled} onClick={props.onRetryPreferences}>Retry preferences</button>}
      </div>}
    </div>
  </div>;
}

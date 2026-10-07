import { useEffect, useRef, type RefObject } from "react";
import type { LocalEntry } from "../../storage/local/indexeddb";

export function HistoryPanel({ entries, selectedId, disabled, onOpen, onNew, onDelete, onClose, openerRef }: {
  entries: LocalEntry[]; selectedId?: string; disabled: boolean;
  onOpen(id: string): void; onNew(): void; onDelete(id: string, button: HTMLButtonElement): void;
  onClose(): void; openerRef: RefObject<HTMLButtonElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) {
        event.preventDefault(); onClose(); openerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, openerRef]);
  const normal = entries.filter(entry => !entry.recovered);
  const recovered = entries.filter(entry => entry.recovered);
  function rows(items: LocalEntry[]) {
    return <ul className="entries-list">{items.map(entry => {
      const date = new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const preview = entry.previewText || "Empty entry";
      return <li key={entry.id} className={`entry-item${entry.id === selectedId ? " selected" : ""}`}>
        <button type="button" className="entry-open" aria-current={entry.id === selectedId ? "true" : undefined}
          disabled={disabled} onClick={() => onOpen(entry.id)} aria-label={`Open ${preview}`}>
          <time className="entry-date" dateTime={entry.createdAt}>{date}</time>
          <span className="entry-preview">{preview}</span>
          {entry.body === null && <span className="entry-availability">Not downloaded</span>}
        </button>
        <button type="button" className="entry-delete" aria-label={`Delete ${preview}`} disabled={disabled}
          onClick={event => onDelete(entry.id, event.currentTarget)}>×</button>
      </li>;
    })}</ul>;
  }
  return <aside className="history-panel" id="entry-history" aria-labelledby="history-heading">
    <div className="history-header"><h2 id="history-heading">History</h2>
      <button type="button" aria-label="New entry" onClick={onNew} disabled={disabled}>+</button>
      <button type="button" aria-label="Close history" ref={closeRef} onClick={() => { onClose(); openerRef.current?.focus(); }}>×</button>
    </div>
    {rows(normal)}
    {recovered.length > 0 && <details className="recovered-history"><summary>Recovered copies ({recovered.length})</summary>{rows(recovered)}</details>}
  </aside>;
}

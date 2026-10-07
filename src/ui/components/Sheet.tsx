import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

/** Native modal semantics provide inert background, focus containment and Escape. */
export function Sheet({ title, children, onClose, openerRef, history = false }: {
  title: string; children: ReactNode; onClose(): void;
  openerRef: RefObject<HTMLButtonElement | null>; history?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const dialog = ref.current; const opener = openerRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => opener?.focus({ preventScroll: true })); };
  }, [openerRef]);
  return <dialog ref={ref} className={`sheet${history ? " history-sheet" : ""}${full ? " sheet-full" : ""}`} aria-labelledby={id}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) onClose(); } }}>
    <button type="button" className="sheet-handle" aria-label={history ? (full ? "Reduce history" : "Expand history") : "Close menu"}
      onPointerDown={e => { dragged.current = false; start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerUp={e => { const delta = e.clientY - (start.current ?? e.clientY); start.current = null; dragged.current = Math.abs(delta) > 40; if (delta > 60) onClose(); else if (delta < -40 && history) setFull(true); }}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } if (history) setFull(value => !value); else onClose(); }}>—</button>
    <h2 id={id} className="sr-only">{title}</h2>
    {children}
  </dialog>;
}

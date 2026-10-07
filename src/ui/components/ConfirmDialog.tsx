import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
export function ConfirmDialog({ children, onCancel, openerRef, title = "Unsynced local changes" }: { children: ReactNode; onCancel: () => void; openerRef: RefObject<HTMLButtonElement | null>; title?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = openerRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => opener?.focus()); };
  }, [openerRef]);
  function trap(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) { event.preventDefault(); return; }
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={ref} aria-labelledby={id} onKeyDown={trap} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{title}</h2>{children}
  </dialog>;
}

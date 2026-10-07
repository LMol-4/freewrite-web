import { useEffect, useId, useRef, type RefObject } from "react";
interface AlertDialogProps { message: string; onClose: () => void; openerRef: RefObject<HTMLButtonElement | null> }
export function AlertDialog({ message, onClose, openerRef }: AlertDialogProps) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => {
    const opener = openerRef.current; const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => opener?.focus()); };
  }, [openerRef]);
  return <dialog ref={ref} className="chat-gate" role="alertdialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}>
    <p id={id}>{message}</p><button type="button" autoFocus onClick={onClose}>OK</button>
  </dialog>;
}

import { useEffect, useId, useRef } from "react";
interface AlertDialogProps { message: string; onClose: () => void }
export function AlertDialog({ message, onClose }: AlertDialogProps) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const opener = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => opener?.focus(); }, []);
  return <dialog ref={ref} role="alertdialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}>
    <p id={id}>{message}</p><button type="button" autoFocus onClick={onClose}>OK</button>
  </dialog>;
}

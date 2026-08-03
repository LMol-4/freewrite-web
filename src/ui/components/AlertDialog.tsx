import { type KeyboardEvent, useEffect, useRef } from "react";

interface AlertDialogProps {
  message: string;
  onClose: () => void;
}

/** Replaces the original's `showCustomAlert` (`js/renderer.js:513-547`), same styling. */
export function AlertDialog({ message, onClose }: AlertDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <>
      <div className="custom-alert-overlay" />
      <div className="custom-alert" role="alertdialog" aria-modal="true" onKeyDown={handleKeyDown}>
        <div className="custom-alert-message">{message}</div>
        <button ref={buttonRef} className="custom-alert-button" onClick={onClose}>
          OK
        </button>
      </div>
    </>
  );
}

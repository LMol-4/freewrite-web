import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

interface PopupProps {
  /** The control that opened this popup — clicks on it don't count as "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared anchored-popover primitive (§9): outside-click and Escape close it.
 * D8: position is computed from the anchor's bounding rect, not hardcoded —
 * `css/styles.css:285`'s `bottom: 60px; left: 20px` only worked for one fixed
 * window size.
 */
export function Popup({ anchorRef, onClose, children }: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;
    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    setPosition({ top: anchorRect.top - popupRect.height - 10, left: anchorRect.left });
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popupRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popupRef}
      className="popup show"
      style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
    >
      <div className="popup-content">{children}</div>
    </div>
  );
}

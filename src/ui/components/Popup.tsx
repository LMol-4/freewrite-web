import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
interface PopupProps { anchorRef: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; label?: string }
export function Popup({ anchorRef, onClose, children, label = "Font size" }: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect(); const popup = popupRef.current?.getBoundingClientRect();
      if (anchor && popup) setPosition({ top: Math.max(8, anchor.top - popup.height - 10), left: Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8)) });
    };
    place(); window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); };
  }, [anchorRef]);
  const placed = position !== null;
  useEffect(() => {
    if (placed) popupRef.current?.querySelector("button")?.focus();
  }, [placed]);
  useEffect(() => {
    const opener = anchorRef.current;
    const pointer = (event: PointerEvent) => { const target = event.target as Node; if (!popupRef.current?.contains(target) && !opener?.contains(target)) onClose(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const buttons = popupRef.current?.querySelectorAll("button"); if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key, true); opener?.focus(); };
  }, [anchorRef, onClose]);
  return <div ref={popupRef} role="dialog" aria-label={label} className="popup show" style={position ?? { visibility: "hidden" }}><div className="popup-content">{children}</div></div>;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useMobileChrome(complete: boolean) {
  const [mobile, setMobile] = useState(false);
  const [hidden, setHidden] = useState(false);
  const typing = useRef({ first: 0, last: 0 });
  useEffect(() => {
    const media = matchMedia("(max-width: 639px)");
    const change = () => setMobile(media.matches); change(); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      const offset = viewport ? Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop) : 0;
      document.documentElement.style.setProperty("--visible-bottom", `${viewport ? viewport.height + viewport.offsetTop : window.innerHeight}px`);
      document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
      document.documentElement.style.setProperty("--visible-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--bottom-safe", offset > 0 ? "0px" : "env(safe-area-inset-bottom)");
    }); };
    update(); window.addEventListener("resize", update); visualViewport?.addEventListener("resize", update); visualViewport?.addEventListener("scroll", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); visualViewport?.removeEventListener("resize", update); visualViewport?.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    if (complete) setHidden(false);
  }, [complete]);
  const reveal = useCallback(() => { typing.current = { first: 0, last: 0 }; setHidden(false); }, []);
  const input = useCallback(() => {
    const now = performance.now(); const state = typing.current;
    if (!state.first || now - state.last > 1500) state.first = now;
    state.last = now;
    if (now - state.first >= 3000 && !document.querySelector("dialog[open]") && document.activeElement?.matches("textarea.editor")) setHidden(true);
  }, []);
  return { mobile, hidden, reveal, input };
}

import { useEffect, useState } from "react";

export function FullscreenControl({ mobile = false }: { mobile?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const update = () => { setSupported(!!document.fullscreenEnabled); setStandalone(media.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone); setActive(!!document.fullscreenElement); };
    update(); const restore = () => { try { setDismissed(localStorage.getItem("freewrite:install-dismissed") === "1"); } catch {} }; restore();
    media.addEventListener("change", update); document.addEventListener("fullscreenchange", update);
    return () => { media.removeEventListener("change", update); document.removeEventListener("fullscreenchange", update); };
  }, []);
  if (standalone) return null;
  if (!supported) return mobile && !dismissed ? <div><p>For an app window, use your browser’s Install or Add to Home Screen option. On iPhone, use Safari’s Share menu → Add to Home Screen.</p><button type="button" onClick={() => { setDismissed(true); try { localStorage.setItem("freewrite:install-dismissed", "1"); } catch {} }}>Dismiss install hint</button></div> : null;
  return <><button type="button" className="control-item" aria-label={active ? "Exit fullscreen" : "Fullscreen"} onClick={async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setError(""); }
    catch { setError("Fullscreen could not open. Try your browser’s fullscreen or installation option."); }
  }}>{active ? "Exit fullscreen" : "Fullscreen"}</button>{error && <p role="alert">{error}</p>}</>;
}

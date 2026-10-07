"use client";
import { useEffect, useState } from "react";
export function useOfflineReadiness() {
  const [status, setStatus] = useState("Offline launch not prepared");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanup: (() => void)[] = [];
    const check = () => {
      if (registration?.waiting) { setStatus("Update ready. Save and close all Freewrite tabs to use it next time."); return; }
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { if (active) setStatus("Offline launch not prepared"); channel.port1.close(); }, 5000);
      cleanup.push(() => { clearTimeout(timeout); channel.port1.close(); });
      channel.port1.onmessage = event => { clearTimeout(timeout); if (active) setStatus(event.data.ready ? "Offline launch ready on this device" : "Offline launch not prepared"); channel.port1.close(); };
      worker.postMessage("readiness", [channel.port2]);
    };
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(value => {
      if (!active) return;
      registration = value;
      check();
      const found = () => {
        const worker = value.installing;
        const update = () => { if (active) check(); };
        worker?.addEventListener("statechange", update);
        cleanup.push(() => worker?.removeEventListener("statechange", update));
      };
      value.addEventListener("updatefound", found); found();
      cleanup.push(() => value.removeEventListener("updatefound", found));
    }).catch(() => { if (active) setStatus("Offline launch could not be prepared. Reconnect and reload to retry."); });
    navigator.serviceWorker.addEventListener("controllerchange", check); window.addEventListener("online", check); window.addEventListener("focus", check);
    return () => { active = false; cleanup.forEach(close => close()); navigator.serviceWorker.removeEventListener("controllerchange", check); window.removeEventListener("online", check); window.removeEventListener("focus", check); };
  }, []);
  return status;
}
export function OfflineReadiness({ status }: { status: string }) {
  return <p role="status" className="offline-readiness">{status}</p>;
}

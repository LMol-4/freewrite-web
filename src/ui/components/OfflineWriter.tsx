"use client";
import { useEffect, useState } from "react";
import { offlineAccount } from "../../storage/offline-access";
import { Writer } from "./Writer";

export function OfflineWriter() {
  const [account, setAccount] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => { void offlineAccount().then(id => { if (active) { setAccount(id); setChecked(true); } }).catch(() => { if (active) { setAccount(null); setChecked(true); } }); };
    check(); window.addEventListener("storage", check); window.addEventListener("pageshow", check);
    return () => { active = false; window.removeEventListener("storage", check); window.removeEventListener("pageshow", check); };
  }, []);
  if (!account) return <main className="auth-page"><div><h1>Freewrite</h1><p>{checked ? "Sign in online to open writing on this device." : "Checking local access…"}</p><a href="/sign-in">Sign in</a></div></main>;
  return <Writer key={account} userId={account} initialPlaceholder="Start writing…" offline />;
}

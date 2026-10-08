"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { setupPrompt } from "@/src/mcp/setup";
import { PlugIcon } from "./PlugIcon";
import { ConfirmDialog } from "./ConfirmDialog";

type Credential = { generation: string; createdAt: string; lastUsedAt: string | null; key?: string };
export function McpConnector({ userId, origin }: { userId: string; origin: string }) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [rotate, setRotate] = useState(false);
  const [sessionValid, setSessionValid] = useState(true);
  const [copyFallback, setCopyFallback] = useState(false);
  const valid = useRef(true);
  const rotateRef = useRef<HTMLButtonElement>(null);
  const prompt = setupPrompt(origin);

  const request = useCallback(async (action?: string, generation?: string | null) => {
    const response = await fetch("/api/mcp-key", {
      method: action ? "POST" : "GET", cache: "no-store",
      ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, generation }) } : {}),
    });
    const result = await response.json();
    if (!valid.current) throw Error("Your session changed. Sign in again.");
    if (!response.ok) throw Error(result.error ?? "Could not load your key.");
    return result.credential as Credential | null;
  }, []);

  const loadKey = useCallback(() => {
    return request("ensure").then(value => {
      if (!value) throw Error("Could not load your key. Please try again.");
      if (valid.current) { setError(""); setCredential(value); setLoaded(true); }
    }).catch(cause => {
      if (valid.current) setError(cause instanceof Error ? cause.message : "Could not load your key. Please try again.");
    }).finally(() => { if (valid.current) setBusy(false); });
  }, [request]);

  useEffect(() => {
    valid.current = true;
    const invalidate = () => { valid.current = false; setSessionValid(false); setSecret(null); setCredential(null); setRotate(false); };
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) invalidate();
    });
    const hide = () => setSecret(null);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    void loadKey();
    return () => { valid.current = false; data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide); };
  }, [loadKey, userId]);

  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(""); setStatus("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }
  async function reveal() {
    if (secret) { setSecret(null); return; }
    await perform(async () => {
      const current = await request("reveal");
      if (!current?.key) throw Error("Could not load your key. Please try again.");
      setCredential({ ...current, key: undefined });
      if (document.visibilityState === "visible") setSecret(current.key);
    });
  }
  async function copyKey() {
    setSecret(null);
    await perform(async () => {
      const current = await request("reveal");
      if (!current?.key) throw Error("Could not load your key. Please try again.");
      setCredential({ ...current, key: undefined });
      try { await navigator.clipboard.writeText(current.key); setStatus("Key copied."); }
      catch { throw Error("Could not copy. Reveal your key, then select and copy it manually."); }
    });
  }
  async function replace() {
    if (!credential) return;
    setSecret(null);
    await perform(async () => {
      setCredential(await request("replace", credential.generation));
      setLoaded(true); setRotate(false);
      setStatus("Key rotated. Update the key in each connected agent.");
    });
  }
  async function copyPrompt() {
    setCopyFallback(false);
    try { await navigator.clipboard.writeText(prompt); setStatus("Setup prompt copied. Paste it into your agent."); }
    catch { setCopyFallback(true); }
  }
  const disabled = busy || !loaded || !sessionValid;
  return <main className="connector-page"><div className="connector-content">
    <Link className="connector-back" href="/">← Back to writing</Link>
    <header><div className="connector-heading"><PlugIcon size={24} /><h1>MCP connector</h1></div>
      <p>Let your agent read your Freewrite notes.</p>
      <p className="connector-muted">List and read synced notes, with no access to create, edit, or delete them.</p>
    </header>
    {!sessionValid && <p role="alert">Your session changed. <Link href="/sign-in">Sign in again</Link> to manage your key.</p>}
    <section aria-labelledby="mcp-key-heading">
      <h2 id="mcp-key-heading">Your API key</h2>
      <p className="connector-muted">One key for all your agents. You can reveal or copy it whenever you need it.</p>
      {!loaded && !error && sessionValid && <p role="status">Loading your key…</p>}
      {credential && <>
        <div className="connector-key">
          <input aria-label="API key" type={secret ? "text" : "password"} readOnly autoComplete="off" spellCheck={false}
            value={secret ?? "••••••••••••••••••••••••"} onFocus={event => { if (secret) event.currentTarget.select(); }} />
          <button type="button" className="connector-eye" aria-label={secret ? "Hide API key" : "Reveal API key"} aria-pressed={!!secret} disabled={disabled} onClick={() => void reveal()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
              {secret && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
        <div className="connector-actions">
          <button type="button" disabled={disabled} onClick={() => void copyKey()}>Copy key</button>
          <button type="button" ref={rotateRef} disabled={disabled} onClick={() => setRotate(true)}>Rotate key</button>
        </div>
        <p className="connector-small">Created {new Date(credential.createdAt).toLocaleDateString()}{credential.lastUsedAt ? " · Last used " + new Date(credential.lastUsedAt).toLocaleDateString() : " · Not used yet"}</p>
      </>}
      {error && !rotate && <p role="alert">{error}</p>}
      {!credential && error && sessionValid && <button type="button" disabled={busy} onClick={() => { setError(""); setBusy(true); void loadKey(); }}>Retry</button>}
    </section>
    <section aria-labelledby="mcp-setup-heading">
      <h2 id="mcp-setup-heading">Connect your agent</h2>
      <p>Copy this prompt into your agent. It will help configure the connection and guide you through entering your key locally.</p>
      <button type="button" onClick={() => void copyPrompt()}>Copy setup prompt</button>
      {copyFallback && <label className="connector-fallback">Select and copy the setup prompt<textarea readOnly value={prompt} onFocus={event => event.currentTarget.select()} /></label>}
      <details><summary>Manual setup</summary>
        <dl><dt>Server URL</dt><dd><code>{origin}/mcp</code></dd><dt>Transport</dt><dd>Streamable HTTP</dd>
          <dt>Authentication header</dt><dd><code>Authorization: Bearer &lt;API_KEY&gt;</code></dd></dl>
        <p>Replace &lt;API_KEY&gt; with your key in your client&apos;s local connection settings.</p>
        <a href="/docs/mcp-setup.md" target="_blank" rel="noopener noreferrer">Read setup instructions</a>
      </details>
    </section>
    <p className="connector-muted connector-small">Works with agents that support API-key-authenticated MCP servers. Only notes synced to your account are available.</p>
    <p role="status" aria-live="polite">{loaded && busy ? "Working…" : status}</p>
    {rotate && <ConfirmDialog title="Rotate API key?" openerRef={rotateRef} onCancel={() => { if (!busy) setRotate(false); }}>
      <p>Your old key will stop working immediately. Update the key in every agent you have connected.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" autoFocus disabled={busy} onClick={() => setRotate(false)}>Cancel</button>
      <button type="button" disabled={busy} onClick={() => void replace()}>Rotate key</button>
    </ConfirmDialog>}
  </div></main>;
}

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { buildChatDispatch, CHAT_TOO_SHORT_MESSAGE, isChatEligible, type ChatDestination, type ChatDispatch } from "@/src/core/prompts";
import { AlertDialog } from "./AlertDialog";
import { Popup } from "./Popup";

const names = { chatgpt: "ChatGPT", claude: "Claude" };

function CopyPromptDialog({ dispatch, destination, openerRef, onClose }: {
  dispatch: ChatDispatch; destination: ChatDestination;
  openerRef: RefObject<HTMLButtonElement | null>; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => opener?.focus()); };
  }, [openerRef]);
  async function copy() {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(dispatch.body);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
  }
  return <dialog ref={dialogRef} className="chat-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id={titleId}>Chat with {names[destination]}</h2>
    <p>Copy the prompt, open {names[destination]}, then paste it into a new chat. Sending it shares this writing with {names[destination]}. You may need to sign in.</p>
    <button type="button" autoFocus disabled={copyState === "copying"} onClick={() => void copy()}>Copy prompt</button>
    <a href={dispatch.bareUrl} tabIndex={0} target="_blank" rel="noopener noreferrer">Open {names[destination]}</a>
    <p role="status" aria-live="polite">{copyState === "copying" ? "Copying…" : copyState === "copied" ? "Prompt copied. Paste it into the new chat." : ""}</p>
    {copyState === "failed" && <>
      <p role="alert">Could not copy automatically. Select the text below and copy it manually.</p>
      <label>Prompt to copy<textarea readOnly value={dispatch.body} onFocus={event => event.currentTarget.select()} /></label>
    </>}
    <button type="button" onClick={onClose}>Close</button>
  </dialog>;
}

export function ChatControl({ body }: { body: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popup, setPopup] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [selection, setSelection] = useState<{ destination: ChatDestination; dispatch: ChatDispatch } | null>(null);
  const closePopup = useCallback(() => setPopup(false), []);
  function choose(destination: ChatDestination) {
    closePopup();
    if (!isChatEligible(body)) { setTooShort(true); return; }
    const dispatch = buildChatDispatch(destination, body);
    // Candidate deep links are unverified. Keep all writing out of external URLs
    // until a real destination check proves complete prompt population (§10).
    setSelection({ destination, dispatch });
  }
  return <>
    <button type="button" className="control-item" ref={buttonRef} aria-haspopup="dialog" aria-expanded={popup}
      onClick={() => { if (!isChatEligible(body)) setTooShort(true); else setPopup(value => !value); }}>Chat</button>
    {popup && <Popup anchorRef={buttonRef} onClose={closePopup} label="Send to AI">
      <button type="button" className="size-option" onClick={() => choose("chatgpt")}>ChatGPT</button>
      <button type="button" className="size-option" onClick={() => choose("claude")}>Claude</button>
    </Popup>}
    {tooShort && <AlertDialog openerRef={buttonRef} message={CHAT_TOO_SHORT_MESSAGE} onClose={() => setTooShort(false)} />}
    {selection && <CopyPromptDialog {...selection} openerRef={buttonRef} onClose={() => setSelection(null)} />}
  </>;
}

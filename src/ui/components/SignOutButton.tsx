import type { RefObject } from "react";
interface SignOutButtonProps { onClick: () => void; disabled?: boolean; buttonRef?: RefObject<HTMLButtonElement | null> }
export function SignOutButton({ onClick, disabled, buttonRef }: SignOutButtonProps) {
  return <button ref={buttonRef} type="button" className="control-item" onClick={onClick} disabled={disabled}>Sign out</button>;
}

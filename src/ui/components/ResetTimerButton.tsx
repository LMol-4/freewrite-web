export function ResetTimerButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="control-item timer-reset" aria-label="Reset timer" title="Reset timer to 15:00" onClick={onClick}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" />
    </svg>
  </button>;
}

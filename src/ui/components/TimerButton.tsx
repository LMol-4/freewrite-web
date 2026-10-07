interface TimerButtonProps {
  label: string;
  onClick: () => void;
}

/** T1: display and toggle. */
export function TimerButton({ label, onClick }: TimerButtonProps) {
  return (
    <button type="button" className="control-item" onClick={onClick}>
      {label}
    </button>
  );
}

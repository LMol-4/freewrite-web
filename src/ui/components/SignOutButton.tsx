interface SignOutButtonProps {
  onClick: () => void;
}

/**
 * §9's toolbar has no desktop sign-out control — "Sign out" only appears in
 * M7's mobile-only `MenuSheet`. Added here so a signed-in user isn't stuck
 * with no way to sign out until M7 ships (deviation, recorded in PROGRESS.md).
 */
export function SignOutButton({ onClick }: SignOutButtonProps) {
  return (
    <span className="control-item" onClick={onClick}>
      Sign out
    </span>
  );
}

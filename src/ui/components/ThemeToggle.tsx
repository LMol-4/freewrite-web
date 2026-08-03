import { otherTheme, type Theme } from "../../core/theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/** H1-H3: light/dark toggle. Label shows the *other* mode (H3). */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const label = otherTheme(theme) === "dark" ? "Dark Mode" : "Light Mode";
  return (
    <span className="control-item" onClick={onToggle}>
      {label}
    </span>
  );
}

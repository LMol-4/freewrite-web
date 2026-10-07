/** H1: light/dark, `data-theme` attribute on `<html>`. */
export type Theme = "light" | "dark";

export const THEMES: readonly Theme[] = ["light", "dark"];

export const DEFAULT_THEME: Theme = "light";

/** H3: the toggle button's label shows the *other* mode. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

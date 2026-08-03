/** F1: the four font choices (`js/renderer.js:69`). */
export type FontMode = "lato" | "system" | "serif" | "random";

export const FONT_MODES: readonly FontMode[] = ["lato", "system", "serif", "random"];

/** F3: sizes offered in the size popup (`index.html:52`). */
export const FONT_SIZES = [16, 18, 20, 22, 24, 26] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** F5. */
export const DEFAULT_FONT_SIZE: FontSize = 18;

/** D7: Lato, not random — the original's `random` startup default contradicted its own toolbar label. */
export const DEFAULT_FONT_MODE: FontMode = "lato";

/** `js/renderer.js:71`. */
export const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** `js/renderer.js:72`. */
export const SERIF_FONT_STACK = "Times New Roman, serif";

/**
 * F2: the "Random" pool (`js/renderer.js:73-80`), verbatim. Self-hosted
 * webfonts for the ones absent on Android/iOS are wired up in `src/fonts/`
 * (D5) — this list is just the display names and picker.
 */
export const RANDOM_FONTS = [
  "Noto Serif Kannada",
  "Georgia",
  "Palatino",
  "Garamond",
  "Bookman",
  "Courier New",
] as const;
export type RandomFont = (typeof RANDOM_FONTS)[number];

export function pickRandomFont(random: () => number = Math.random): RandomFont {
  const index = Math.floor(random() * RANDOM_FONTS.length);
  return RANDOM_FONTS[index];
}

/**
 * D5: CSS `font-family` for each `RandomFont`. Georgia, "Palatino" (falls
 * back to a serif stack) and Courier New are safe system fonts; the rest
 * resolve to the self-hosted `next/font/local` variables in `src/fonts/`.
 */
const RANDOM_FONT_FAMILIES: Record<RandomFont, string> = {
  "Noto Serif Kannada": "var(--font-noto-serif-kannada)",
  Georgia: "Georgia, serif",
  Palatino: '"Palatino Linotype", Palatino, serif',
  Garamond: "var(--font-eb-garamond)",
  Bookman: "var(--font-libre-baskerville)",
  "Courier New": '"Courier New", monospace',
};

export function fontFamilyForRandomPick(pick: RandomFont): string {
  return RANDOM_FONT_FAMILIES[pick];
}

/**
 * CSS `font-family` for a given mode. If `mode` is "random" and no pick is
 * given, one is chosen on the spot — a caller that already tracks its own
 * pick (to keep a button label in sync) should pass it through instead.
 */
export function resolveFontFamily(
  mode: FontMode,
  randomPick?: RandomFont,
  random: () => number = Math.random,
): string {
  switch (mode) {
    case "lato":
      return "var(--font-lato)";
    case "system":
      return SYSTEM_FONT_STACK;
    case "serif":
      return SERIF_FONT_STACK;
    case "random":
      return fontFamilyForRandomPick(randomPick ?? pickRandomFont(random));
  }
}

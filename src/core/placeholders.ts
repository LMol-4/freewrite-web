/** E4: verbatim list (`js/renderer.js:34-43`). */
export const PLACEHOLDERS = [
  "Begin writing",
  "Pick a thought and go",
  "Start typing",
  "What's on your mind",
  "Just start",
  "Type your first thought",
  "Start with one sentence",
  "Just say it",
] as const;

/** Chosen once per mount, per E4. */
export function pickPlaceholder(random: () => number = Math.random): string {
  return PLACEHOLDERS[Math.floor(random() * PLACEHOLDERS.length)];
}

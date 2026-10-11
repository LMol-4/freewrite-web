/** New entries start with two newlines (E5, `js/renderer.js:445`). */
export const NEW_ENTRY_BODY = "\n\n";

const PREVIEW_LENGTH = 30;

/** Matches `js/renderer.js:488-489`: newlines collapsed to spaces, trimmed, truncated at 30 chars. */
export function derivePreview(body: string): string {
  const flattened = body.replace(/\n/g, " ").trim();
  if (flattened.length <= PREVIEW_LENGTH) return flattened;
  // Never split an emoji: a lone surrogate is rejected by Postgres jsonb.
  const cut = flattened.slice(0, PREVIEW_LENGTH);
  return (/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut) + "...";
}

export function deriveWordCount(body: string): number {
  const trimmed = body.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function deriveCharCount(body: string): number {
  return body.trim().length;
}

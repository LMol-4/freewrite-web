/** New entries start with two newlines (E5, `js/renderer.js:445`). */
export const NEW_ENTRY_BODY = "\n\n";

const PREVIEW_LENGTH = 30;

/** Matches `js/renderer.js:488-489`: newlines collapsed to spaces, trimmed, truncated at 30 chars. */
export function derivePreview(body: string): string {
  const flattened = body.replace(/\n/g, " ").trim();
  return flattened.length > PREVIEW_LENGTH
    ? flattened.slice(0, PREVIEW_LENGTH) + "..."
    : flattened;
}

export function deriveWordCount(body: string): number {
  const trimmed = body.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function deriveCharCount(body: string): number {
  return body.trim().length;
}

/** An entry is empty when its trimmed body is empty — the whole cleanup safety argument (§7). */
export function isEmptyBody(body: string): boolean {
  return body.trim() === "";
}

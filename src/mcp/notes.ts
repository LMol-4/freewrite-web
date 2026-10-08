import { UUID } from "./http";
export interface NoteRow {
  id: string; created_at: string; updated_at: string; client_updated_at: string;
  preview_text: string; word_count: number; version: number; is_recovered: boolean;
}
export interface NoteRepository {
  list(limit: number, cursor?: { createdAt: string; id: string }): Promise<NoteRow[]>;
  get(id: string): Promise<NoteRow | null>;
  body(row: NoteRow): Promise<string>;
}
export class InvalidArguments extends Error {}
const invalid = () => { throw new InvalidArguments("Invalid tool arguments."); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function decode(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
  try { return object(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); } catch { return invalid(); }
}
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function metadata(row: NoteRow) {
  return { id: row.id, created_at: row.created_at, updated_at: row.client_updated_at,
    synced_at: row.updated_at, word_count: row.word_count, version: row.version, recovered: row.is_recovered };
}
export async function listNotes(repository: NoteRepository, value: unknown) {
  const args = object(value);
  if (Object.keys(args).some(key => !["limit", "cursor"].includes(key))) invalid();
  const limit = args.limit ?? 25;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50) return invalid();
  let cursor: { createdAt: string; id: string } | undefined;
  if (args.cursor !== undefined) {
    const decoded = decode(args.cursor);
    if (typeof decoded.id !== "string" || !UUID.test(decoded.id) || typeof decoded.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(decoded.createdAt) || !Number.isFinite(Date.parse(decoded.createdAt))) return invalid();
    cursor = { id: decoded.id, createdAt: decoded.createdAt };
  }
  const rows = await repository.list(limit + 1, cursor);
  const notes = [];
  for (const row of rows.slice(0, limit)) {
    try {
      const body = (await repository.body(row)).replace(/\s+/g, " ").trim();
      notes.push({ ...metadata(row), excerpt: body.slice(0, 400), excerpt_truncated: body.length > 400 });
    } catch {
      notes.push({ ...metadata(row), excerpt: row.preview_text, excerpt_unavailable: true });
    }
  }
  const last = rows[Math.min(limit, rows.length) - 1];
  return { notes, next_cursor: rows.length > limit && last ? encode({ createdAt: last.created_at, id: last.id }) : null };
}
export async function getNotes(repository: NoteRepository, value: unknown) {
  const args = object(value);
  if (Object.keys(args).some(key => !["ids", "cursor"].includes(key))) invalid();
  if (!Array.isArray(args.ids) || !args.ids.length || args.ids.length > 10 || args.ids.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(args.ids).size !== args.ids.length) return invalid();
  const ids = args.ids as string[];
  let continuation: { id: string; version: number; offset: number } | undefined;
  if (args.cursor !== undefined) {
    const c = decode(args.cursor);
    if (ids.length !== 1 || c.id !== ids[0] || typeof c.version !== "number" || !Number.isSafeInteger(c.version) || c.version < 1 ||
      typeof c.offset !== "number" || !Number.isSafeInteger(c.offset) || c.offset < 0) return invalid();
    continuation = { id: ids[0], version: c.version, offset: c.offset };
  }
  const notes = [];
  for (const id of ids) {
    try {
      const row = await repository.get(id);
      if (!row) { notes.push({ id, error: "not_found" }); continue; }
      if (continuation && continuation.version !== row.version) { notes.push({ id, error: "note_changed", message: "Read this note again without a cursor." }); continue; }
      const body = await repository.body(row);
      const offset = continuation?.offset ?? 0;
      if (offset > body.length) { notes.push({ id, error: "invalid_cursor" }); continue; }
      let end = Math.min(offset + 12000, body.length);
      if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
      notes.push({ ...metadata(row), content: body.slice(offset, end), offset,
        next_cursor: end < body.length ? encode({ id, version: row.version, offset: end }) : null });
    } catch { notes.push({ id, error: "unavailable", message: "This note could not be read. Retry later." }); }
  }
  return { notes };
}

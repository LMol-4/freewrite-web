/**
 * The MCP seam (§12). A later MCP server implements tools over
 * `SupabaseEntryStore` through this same interface, with no changes to the UI.
 */

export interface EntryMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  previewText: string;
  wordCount: number;
  charCount: number;
  version: number;
}

export interface Entry extends EntryMeta {
  body: string;
}

/** Thrown by `update` when `expectedVersion` no longer matches the stored version (§7 failsafe). */
export class VersionConflictError extends Error {
  constructor(id: string) {
    super(`version_conflict: ${id}`);
    this.name = "VersionConflictError";
  }
}

export interface EntryStore {
  list(opts?: { limit?: number; before?: Date }): Promise<EntryMeta[]>;
  get(id: string): Promise<Entry | null>;
  create(input: { body: string; createdAt?: Date }): Promise<Entry>;
  update(id: string, body: string, expectedVersion: number): Promise<Entry>;
  delete(id: string): Promise<void>;
  search?(query: string): Promise<EntryMeta[]>;
}

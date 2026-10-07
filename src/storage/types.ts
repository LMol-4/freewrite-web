/** Portable entry derivations. Account-local generations are distinct from server versions.
 * The injectable remote boundary is RemoteStore in sync/types.ts.
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

export interface EntryCursor { createdAt: string; id: string }

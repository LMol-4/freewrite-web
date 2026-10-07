/**
 * The client mints entry ids, not the database (§6) — `storage_path` is
 * derived from the id and the body is uploaded to Storage before the row is
 * inserted, so a server-assigned id would make the upload path unknowable at
 * upload time.
 */
export function generateEntryId(): string {
  return crypto.randomUUID();
}

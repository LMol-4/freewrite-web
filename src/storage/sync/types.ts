import type { Database } from "../../lib/supabase/database.types";
export type RemoteEntry = Database["public"]["Tables"]["entries"]["Row"];
export interface Publication {
  id: string; operation: "create" | "update" | "delete"; expectedVersion: number | null;
  revisionId: string | null; path: string; sha256: string | null; createdAt: string;
  updatedAt: string; preview: string; wordCount: number; charCount: number;
  recovered: boolean; conflictOf: string | null;
}
export interface Mutation {
  userId: string; mutationId: string; entryId: string; generation: number;
  body: string | null; request: Publication; attempts: number; retryAt: number;
  failure?: { message: string; kind: "auth" | "permission" | "retry" | "integrity" };
}
export interface Cleanup { userId: string; entryId: string; path: string; wholeEntry: boolean }
export interface PublicationResult { status: "ok" | "conflict" | "deleted" | "missing"; entry?: RemoteEntry }
export interface RemoteStore {
  list(cursor?: { createdAt: string; id: string }): Promise<{ rows: RemoteEntry[]; next?: { createdAt: string; id: string } }>;
  get(id: string): Promise<RemoteEntry | null>;
  body(entry: RemoteEntry): Promise<string>;
  publish(mutation: Mutation): Promise<PublicationResult>;
  cleanup(task: Cleanup): Promise<void>;
}
export class RemoteError extends Error {
  constructor(message: string, readonly kind: "auth" | "permission" | "retry" | "integrity", readonly retryAfter = 0) { super(message); }
}
export async function digest(body: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, "0")).join("");
}

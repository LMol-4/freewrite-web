import { describe, expect, it, vi } from "vitest";
import { getNotes, listNotes, type NoteRepository, type NoteRow } from "./notes";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row: NoteRow = { id, created_at: "2026-10-08T12:00:00+00:00", updated_at: "2026-10-08T12:01:00Z", client_updated_at: "2026-10-08T12:00:30Z", preview_text: "short", word_count: 20, version: 3, is_recovered: false };
function repo(body = "A complete note."): NoteRepository {
  return { list: vi.fn(async () => [row]), get: vi.fn(async (key: string) => key === id ? row : null), body: vi.fn(async () => body) };
}
describe("note retrieval", () => {
  it("paginates tied dates by ID without returning all bodies", async () => {
    const store = repo("a".repeat(500));
    store.list = vi.fn(async () => [row, { ...row, id: other }]);
    const first = await listNotes(store, { limit: 1 });
    expect(first.notes).toHaveLength(1); expect(first.notes[0].excerpt).toHaveLength(400);
    expect(store.body).toHaveBeenCalledTimes(1);
    await listNotes(store, { limit: 1, cursor: first.next_cursor });
    expect(store.list).toHaveBeenLastCalledWith(2, { createdAt: row.created_at, id });
  });
  it("rejects injection cursors, unknown arguments, and oversized batches before reads", async () => {
    const store = repo();
    const cursor = Buffer.from(JSON.stringify({ createdAt: "x),user_id.neq.x", id })).toString("base64url");
    await expect(listNotes(store, { cursor })).rejects.toThrow();
    await expect(listNotes(store, { user_id: other })).rejects.toThrow();
    await expect(getNotes(store, { ids: Array(11).fill(id) })).rejects.toThrow();
    await expect(getNotes(store, { ids: [id, id] })).rejects.toThrow();
    expect(store.get).not.toHaveBeenCalled(); expect(store.list).not.toHaveBeenCalled();
  });
  it("retrieves complete Unicode content across bounded chunks and detects changed revisions", async () => {
    const body = "x".repeat(11999) + "😀" + "y".repeat(12000);
    const store = repo(body);
    let cursor: string | null | undefined; let combined = "";
    do {
      const part = (await getNotes(store, { ids: [id], ...(cursor ? { cursor } : {}) })).notes[0];
      if (!("content" in part)) throw Error("Expected note content");
      combined += part.content; cursor = part.next_cursor;
      expect(part.content!.length).toBeLessThanOrEqual(12000);
    } while (cursor);
    expect(combined).toBe(body);
    const first = (await getNotes(store, { ids: [id] })).notes[0];
    if (!("next_cursor" in first)) throw Error("Expected continuation");
    store.get = async () => ({ ...row, version: 4 });
    expect((await getNotes(store, { ids: [id], cursor: first.next_cursor })).notes[0].error).toBe("note_changed");
  });
  it("returns partial failures and keeps unavailable excerpts visible", async () => {
    const store = repo();
    expect((await getNotes(store, { ids: [id, other] })).notes.map(n => n.error ?? "ok")).toEqual(["ok", "not_found"]);
    store.body = async () => { throw Error("private storage details"); };
    expect((await listNotes(store, {})).notes[0]).toMatchObject({ excerpt: "short", excerpt_unavailable: true });
    expect(JSON.stringify(await getNotes(store, { ids: [id] }))).not.toContain("private storage");
  });
});

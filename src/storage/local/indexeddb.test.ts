import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createIndexedDBEntryStore } from "./indexeddb";
import { VersionConflictError } from "../types";

// `indexedDB.deleteDatabase` blocks until every open connection closes, and
// stores here never close theirs — so clear via the public interface instead.
beforeEach(async () => {
  const store = createIndexedDBEntryStore();
  const metas = await store.list();
  await Promise.all(metas.map((meta) => store.delete(meta.id)));
});

describe("createIndexedDBEntryStore", () => {
  it("create returns an entry seeded from the body", async () => {
    const store = createIndexedDBEntryStore();
    const entry = await store.create({ body: "hello world" });
    expect(entry.body).toBe("hello world");
    expect(entry.previewText).toBe("hello world");
    expect(entry.wordCount).toBe(2);
    expect(entry.charCount).toBe(11);
    expect(entry.version).toBe(1);
    expect(entry.id).toBeTruthy();
  });

  it("get retrieves a created entry by id", async () => {
    const store = createIndexedDBEntryStore();
    const created = await store.create({ body: "hi" });
    const fetched = await store.get(created.id);
    expect(fetched).toEqual(created);
  });

  it("get returns null for an unknown id", async () => {
    const store = createIndexedDBEntryStore();
    expect(await store.get("does-not-exist")).toBeNull();
  });

  it("list returns metadata only, newest first", async () => {
    const store = createIndexedDBEntryStore();
    const first = await store.create({ body: "first", createdAt: new Date("2024-01-01") });
    const second = await store.create({ body: "second", createdAt: new Date("2024-01-02") });
    const list = await store.list();
    expect(list.map((e) => e.id)).toEqual([second.id, first.id]);
    expect(list[0]).not.toHaveProperty("body");
  });

  it("list respects limit and before", async () => {
    const store = createIndexedDBEntryStore();
    await store.create({ body: "a", createdAt: new Date("2024-01-01") });
    const b = await store.create({ body: "b", createdAt: new Date("2024-01-02") });
    await store.create({ body: "c", createdAt: new Date("2024-01-03") });

    expect(await store.list({ limit: 1 })).toHaveLength(1);

    const before = await store.list({ before: new Date("2024-01-03") });
    expect(before.map((e) => e.id)).toEqual([b.id, before[1].id]);
  });

  it("update rewrites the body and bumps the version", async () => {
    const store = createIndexedDBEntryStore();
    const created = await store.create({ body: "one" });
    const updated = await store.update(created.id, "one two", created.version);
    expect(updated.body).toBe("one two");
    expect(updated.wordCount).toBe(2);
    expect(updated.version).toBe(2);
  });

  it("update throws VersionConflictError on a stale version", async () => {
    const store = createIndexedDBEntryStore();
    const created = await store.create({ body: "one" });
    await store.update(created.id, "one two", created.version);
    await expect(store.update(created.id, "one two three", created.version)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });

  it("update throws for an id that was never created", async () => {
    const store = createIndexedDBEntryStore();
    await expect(store.update("missing", "text", 1)).rejects.toThrow("entry not found");
  });

  it("delete removes the entry", async () => {
    const store = createIndexedDBEntryStore();
    const created = await store.create({ body: "gone soon" });
    await store.delete(created.id);
    expect(await store.get(created.id)).toBeNull();
  });
});

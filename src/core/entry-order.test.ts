import { expect, it } from "vitest";
import { newestFirst } from "./entry-order";
it("orders timezone-equivalent instants by ID rather than timestamp spelling", () => {
  const rows = [{ id: "a", createdAt: "2026-10-06T10:00:00.000Z" }, { id: "b", createdAt: "2026-10-06T11:00:00+01:00" }];
  expect(rows.sort(newestFirst).map(row => row.id)).toEqual(["b", "a"]);
});
it("preserves server microsecond ordering beside local millisecond timestamps", () => {
  const rows = [{ id: "z", createdAt: "2026-10-06T10:00:00.123Z" }, { id: "a", createdAt: "2026-10-06T10:00:00.123456+00:00" }];
  expect(rows.sort(newestFirst).map(row => row.id)).toEqual(["a", "z"]);
});

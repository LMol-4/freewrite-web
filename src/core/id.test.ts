import { describe, expect, it } from "vitest";
import { generateEntryId } from "./id";

describe("generateEntryId", () => {
  it("returns a v4 UUID", () => {
    const id = generateEntryId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("returns a different id on each call", () => {
    expect(generateEntryId()).not.toBe(generateEntryId());
  });
});

import { describe, expect, it } from "vitest";
import { PLACEHOLDERS, pickPlaceholder } from "./placeholders";

describe("pickPlaceholder", () => {
  it("has 8 options, per the original list", () => {
    expect(PLACEHOLDERS).toHaveLength(8);
  });

  it("picks the first option when random() returns 0", () => {
    expect(pickPlaceholder(() => 0)).toBe(PLACEHOLDERS[0]);
  });

  it("picks the last option just under 1", () => {
    expect(pickPlaceholder(() => 0.999999)).toBe(PLACEHOLDERS[PLACEHOLDERS.length - 1]);
  });
});

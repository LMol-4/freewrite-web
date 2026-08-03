import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, otherTheme } from "./theme";

describe("constants", () => {
  it("defaults to light", () => {
    expect(DEFAULT_THEME).toBe("light");
  });

  it("offers light and dark", () => {
    expect(THEMES).toEqual(["light", "dark"]);
  });
});

describe("otherTheme", () => {
  it("returns dark for light", () => {
    expect(otherTheme("light")).toBe("dark");
  });

  it("returns light for dark", () => {
    expect(otherTheme("dark")).toBe("light");
  });
});

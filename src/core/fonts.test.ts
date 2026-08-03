import { describe, expect, it } from "vitest";
import {
  FONT_SIZES,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_MODE,
  RANDOM_FONTS,
  pickRandomFont,
} from "./fonts";

describe("constants", () => {
  it("offers the six original sizes", () => {
    expect(FONT_SIZES).toEqual([16, 18, 20, 22, 24, 26]);
  });

  it("defaults to 18px", () => {
    expect(DEFAULT_FONT_SIZE).toBe(18);
  });

  it("defaults to lato, not random (D7)", () => {
    expect(DEFAULT_FONT_MODE).toBe("lato");
  });
});

describe("pickRandomFont", () => {
  it("picks the first font when random() returns 0", () => {
    expect(pickRandomFont(() => 0)).toBe(RANDOM_FONTS[0]);
  });

  it("picks the last font just under 1", () => {
    expect(pickRandomFont(() => 0.999999)).toBe(RANDOM_FONTS[RANDOM_FONTS.length - 1]);
  });

  it("only ever returns a font from the list", () => {
    for (let i = 0; i < RANDOM_FONTS.length; i++) {
      const picked = pickRandomFont(() => i / RANDOM_FONTS.length);
      expect(RANDOM_FONTS).toContain(picked);
    }
  });
});

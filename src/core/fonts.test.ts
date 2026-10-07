import { describe, expect, it } from "vitest";
import {
  FONT_SIZES,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_MODE,
  RANDOM_FONTS,
  pickRandomFont,
  resolveFontFamily,
  fontFamilyForRandomPick,
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

describe("resolveFontFamily", () => {
  it("resolves lato to the self-hosted variable", () => {
    expect(resolveFontFamily("lato")).toBe("var(--font-lato)");
  });

  it("resolves system to the system font stack", () => {
    expect(resolveFontFamily("system")).toContain("-apple-system");
  });

  it("resolves serif to the serif font stack", () => {
    expect(resolveFontFamily("serif")).toBe("Times New Roman, serif");
  });

  it("resolves random using the given pick", () => {
    expect(resolveFontFamily("random", "Georgia")).toBe("Georgia, serif");
  });

  it("picks one on the spot when random has no pick yet", () => {
    expect(resolveFontFamily("random", undefined, () => 0)).toBe(fontFamilyForRandomPick(RANDOM_FONTS[0]));
  });
});

describe("fontFamilyForRandomPick", () => {
  it("maps every random font to a distinct css value", () => {
    const families = RANDOM_FONTS.map(fontFamilyForRandomPick);
    expect(new Set(families).size).toBe(RANDOM_FONTS.length);
  });

  it("self-hosts Garamond and Bookman under their substitute families", () => {
    expect(fontFamilyForRandomPick("Garamond")).toBe("var(--font-eb-garamond)");
    expect(fontFamilyForRandomPick("Bookman")).toBe("var(--font-libre-baskerville)");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, parseStoredPreferences } from "./preferences";

describe("parseStoredPreferences", () => {
  it("returns defaults with the epoch timestamp for a null raw value", () => {
    const result = parseStoredPreferences(null);
    expect(result).toMatchObject(DEFAULT_PREFERENCES);
    expect(result.clientUpdatedAt).toBe(new Date(0).toISOString());
  });

  it("returns defaults for malformed JSON", () => {
    const result = parseStoredPreferences("not json");
    expect(result).toMatchObject(DEFAULT_PREFERENCES);
  });

  it("round-trips a fully valid stored value", () => {
    const raw = JSON.stringify({
      theme: "dark",
      font: "serif",
      fontSize: 22,
      clientUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parseStoredPreferences(raw)).toEqual({
      theme: "dark",
      font: "serif",
      fontSize: 22,
      clientUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("falls back per-field on invalid values rather than discarding the whole object", () => {
    const raw = JSON.stringify({ theme: "purple", font: "serif", fontSize: 999 });
    const result = parseStoredPreferences(raw);
    expect(result.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(result.font).toBe("serif");
    expect(result.fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
    expect(result.clientUpdatedAt).toBe(new Date(0).toISOString());
  });
});

it("malformed and invalid timestamps never participate in ordering", () => {
  expect(parseStoredPreferences("null")).toMatchObject(DEFAULT_PREFERENCES);
  expect(parseStoredPreferences('{"clientUpdatedAt":"invalid"}').clientUpdatedAt).toBe(new Date(0).toISOString());
});

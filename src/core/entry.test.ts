import { describe, expect, it } from "vitest";
import {
  NEW_ENTRY_BODY,
  derivePreview,
  deriveWordCount,
  deriveCharCount,
  isEmptyBody,
} from "./entry";

describe("derivePreview", () => {
  it("returns short text unchanged", () => {
    expect(derivePreview("hello world")).toBe("hello world");
  });

  it("collapses newlines to spaces", () => {
    expect(derivePreview("hello\nworld")).toBe("hello world");
  });

  it("trims surrounding whitespace", () => {
    expect(derivePreview("  hello world  ")).toBe("hello world");
  });

  it("truncates at 30 chars and appends an ellipsis", () => {
    const body = "a".repeat(40);
    const preview = derivePreview(body);
    expect(preview).toBe("a".repeat(30) + "...");
  });

  it("does not truncate exactly 30 chars", () => {
    const body = "a".repeat(30);
    expect(derivePreview(body)).toBe(body);
  });

  it("returns empty string for an empty body", () => {
    expect(derivePreview(NEW_ENTRY_BODY)).toBe("");
  });
});

describe("deriveWordCount", () => {
  it("counts words separated by whitespace", () => {
    expect(deriveWordCount("hello world foo")).toBe(3);
  });

  it("is zero for an empty or whitespace-only body", () => {
    expect(deriveWordCount("")).toBe(0);
    expect(deriveWordCount(NEW_ENTRY_BODY)).toBe(0);
  });

  it("collapses repeated whitespace and newlines", () => {
    expect(deriveWordCount("hello   world\n\nfoo")).toBe(3);
  });
});

describe("deriveCharCount", () => {
  it("counts trimmed characters", () => {
    expect(deriveCharCount("  hello  ")).toBe(5);
  });

  it("is zero for an empty body", () => {
    expect(deriveCharCount(NEW_ENTRY_BODY)).toBe(0);
  });
});

describe("isEmptyBody", () => {
  it("is true for the new-entry seed body", () => {
    expect(isEmptyBody(NEW_ENTRY_BODY)).toBe(true);
  });

  it("is true for whitespace only", () => {
    expect(isEmptyBody("   \n  ")).toBe(true);
  });

  it("is false once there is any non-whitespace text", () => {
    expect(isEmptyBody("  x  ")).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptKey, encryptKey, generateKey, keyHash } from "./crypto";
afterEach(() => vi.unstubAllEnvs());
describe("MCP credentials", () => {
  it("generates distinct keys and authenticated owner-bound ciphertext", () => {
    vi.stubEnv("MCP_KEY_ENCRYPTION_SECRET", "ab".repeat(32));
    const key = generateKey(); expect(key).toMatch(/^fw_[A-Za-z0-9_-]{43}$/);
    expect(generateKey()).not.toBe(key);
    const encrypted = encryptKey(key, "alice");
    expect(encrypted).not.toContain(key); expect(decryptKey(encrypted, "alice")).toBe(key);
    expect(encryptKey(key, "alice")).not.toBe(encrypted);
    expect(() => decryptKey(encrypted, "bob")).toThrow();
    const parts = encrypted.split("."); parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    expect(() => decryptKey(parts.join("."), "alice")).toThrow();
    expect(keyHash(key)).toHaveLength(64);
  });
  it("fails closed for missing or changed encryption secrets", () => {
    vi.stubEnv("MCP_KEY_ENCRYPTION_SECRET", ""); expect(() => encryptKey("key", "alice")).toThrow();
    vi.stubEnv("MCP_KEY_ENCRYPTION_SECRET", "ab".repeat(32)); const encrypted = encryptKey("key", "alice");
    vi.stubEnv("MCP_KEY_ENCRYPTION_SECRET", "cd".repeat(32)); expect(() => decryptKey(encrypted, "alice")).toThrow();
  });
});

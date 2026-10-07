import { expect, it, vi } from "vitest";
import { appOrigin, callbackPath, emailInput, passwordInput } from "./validation";
it("restricts callbacks to two supported relative destinations", () => {
  for (const path of ["//evil.test", "https://evil.test", "/\\evil.test", "/other", null]) expect(callbackPath(path)).toBe("/");
  expect(callbackPath("/reset-password")).toBe("/reset-password");
});
it("rejects untrusted request origins and unsafe configured origins", () => {
  vi.stubEnv("APP_ORIGIN", "https://writing.example"); vi.stubEnv("APP_ALLOWED_ORIGINS", "http://127.0.0.1:3000");
  expect(appOrigin()).toBe("https://writing.example"); expect(appOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  expect(() => appOrigin("https://evil.test")).toThrow(); vi.stubEnv("APP_ORIGIN", "http://writing.example"); expect(() => appOrigin()).toThrow(); vi.unstubAllEnvs();
});
it("validates server input types, email and password length", () => {
  const form = new FormData(); expect(() => emailInput(form)).toThrow(); form.set("email", " a@example.test "); expect(emailInput(form)).toBe("a@example.test");
  form.set("password", "short"); expect(() => passwordInput(form)).toThrow(); form.set("password", "a safe password"); expect(passwordInput(form)).toBe("a safe password");
});

import { afterEach, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("aborts a stalled request and preserves caller cancellation", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)); }));
  const pending = expect(fetchWithTimeout("http://127.0.0.1/fixture")).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10000); await pending;
  const controller = new AbortController();
  const cancelled = expect(fetchWithTimeout("http://127.0.0.1/fixture", { signal: controller.signal })).rejects.toThrow("cancelled");
  controller.abort(Error("cancelled")); await cancelled;
});

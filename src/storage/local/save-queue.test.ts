import { expect, it } from "vitest";
import { LocalSaveQueue } from "./save-queue";
it("starts immediately, serializes continuous input and only acknowledges latest commit", async () => {
  const writes: string[] = []; const status: string[] = []; const releases: (() => void)[] = [];
  const queue = new LocalSaveQueue(async body => { writes.push(body); await new Promise<void>(r => releases.push(r)); }, state => status.push(state));
  queue.request("a"); expect(writes).toEqual(["a"]);
  queue.request("ab"); queue.request("abc"); expect(writes).toEqual(["a"]);
  releases.shift()!(); await Promise.resolve(); await Promise.resolve();
  expect(writes).toEqual(["a", "abc"]); expect(status).not.toContain("saved");
  releases.shift()!(); await queue.flush(); expect(status.at(-1)).toBe("saved");
});
it("quota failure remains unsaved with buffer retained, then retries", async () => {
  let fail = true; const writes: string[] = []; const status: string[] = [];
  const queue = new LocalSaveQueue(async body => { if (fail) throw new DOMException("quota", "QuotaExceededError"); writes.push(body); }, state => status.push(state));
  queue.request("keep me"); await expect(queue.flush()).rejects.toThrow("quota");
  expect(status).not.toContain("saved"); expect(queue.unsaved).toBe(true);
  fail = false; await queue.flush(); expect(writes).toEqual(["keep me"]); expect(status.at(-1)).toBe("saved");
});

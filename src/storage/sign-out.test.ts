import { expect, it, vi } from "vitest";
import { safeSignOut } from "./sign-out";

it("ordinary sign-out cannot remove unsynced writing", async () => {
  const signOut = vi.fn();
  const cleanup = vi.fn();
  expect(await safeSignOut({ hasUnsyncedWriting: async () => true, discard: false, signOut, cleanup })).toBe("confirmation-required");
  expect(signOut).not.toHaveBeenCalled();
  expect(cleanup).not.toHaveBeenCalled();
});

it("failed revocation preserves writing even after explicit discard", async () => {
  const cleanup = vi.fn();
  await expect(safeSignOut({ hasUnsyncedWriting: async () => true, discard: true,
    signOut: async () => ({ error: { message: "offline" } }), cleanup })).rejects.toThrow("offline");
  expect(cleanup).not.toHaveBeenCalled();
});

it("failure to inspect writing fails closed", async () => {
  const signOut = vi.fn();
  await expect(safeSignOut({ hasUnsyncedWriting: async () => { throw Error("storage unavailable"); }, discard: true,
    signOut, cleanup: vi.fn() })).rejects.toThrow("storage unavailable");
  expect(signOut).not.toHaveBeenCalled();
});

it("acknowledges successful local sign-out only after cleanup", async () => {
  const order: string[] = [];
  expect(await safeSignOut({ hasUnsyncedWriting: async () => true, discard: true,
    signOut: async () => { order.push("auth"); return { error: null }; }, cleanup: async () => { order.push("cleanup"); } })).toBe("signed-out");
  expect(order).toEqual(["auth", "cleanup"]);
});
it("failed local cleanup is surfaced rather than acknowledged as success", async () => {
  await expect(safeSignOut({ hasUnsyncedWriting: async () => false, discard: false,
    signOut: async () => ({ error: null }), cleanup: async () => { throw Error("cleanup failed"); } })).rejects.toThrow("cleanup failed");
});

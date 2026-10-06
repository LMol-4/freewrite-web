import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, expect, it } from "vitest";
import { claimAccount, closeDatabase } from "./local/indexeddb";
import { DEFAULT_PREFERENCES, patchPreferences, PreferenceSync, readPreferences, type ServerPreferences } from "./preferences";
beforeEach(async () => { await closeDatabase(); await deleteDB("freewrite"); await claimAccount("a", "tab"); });
it("failed preferences remain durable and retry after reopening", async () => {
  await patchPreferences("a", "tab", { theme: "dark" });
  let offline = true; let server: ServerPreferences = { values: DEFAULT_PREFERENCES, version: 1 };
  const sync = new PreferenceSync("a", "tab", { fetch: async () => { if (offline) throw Error("offline"); return server; }, publish: async (_version, patch) => (server = { version: 2, values: { ...server.values, ...patch } }) }, () => {});
  await expect(sync.flush()).rejects.toThrow("offline"); await closeDatabase();
  expect((await readPreferences("a")).pending).toEqual({ theme: "dark" });
  offline = false; await sync.flush(); expect((await readPreferences("a")).pending).toEqual({}); expect(server.values.theme).toBe("dark");
});
it("conflict rebases only pending fields, irrespective of device clocks", async () => {
  await patchPreferences("a", "tab", { theme: "dark" });
  let server: ServerPreferences = { values: DEFAULT_PREFERENCES, version: 1 }; let calls = 0;
  const sync = new PreferenceSync("a", "tab", { fetch: async () => server, publish: async (version, patch) => {
    if (++calls === 1) { server = { version: 2, values: { ...DEFAULT_PREFERENCES, fontSize: 26 } }; return null; }
    expect(version).toBe(2); server = { version: 3, values: { ...server.values, ...patch } }; return server;
  } }, () => {});
  await sync.flush(); expect((await readPreferences("a")).values).toMatchObject({ theme: "dark", fontSize: 26 });
});
it("acknowledgement cannot clear a newer edit to the same field", async () => {
  await patchPreferences("a", "tab", { theme: "dark" });
  let server: ServerPreferences = { values: DEFAULT_PREFERENCES, version: 1 }; let calls = 0;
  const sync = new PreferenceSync("a", "tab", { fetch: async () => server, publish: async (_version, patch) => {
    if (++calls === 1) await patchPreferences("a", "tab", { theme: "light", font: "serif" });
    server = { version: server.version + 1, values: { ...server.values, ...patch } }; return server;
  } }, () => {});
  await sync.flush(); expect(calls).toBe(2); expect(server.values).toMatchObject({ theme: "light", font: "serif" }); expect((await readPreferences("a")).pending).toEqual({});
});
it("a lost coordinator cannot apply delayed preference responses", async () => {
  await patchPreferences("a", "tab", { theme: "dark" });
  const sync = new PreferenceSync("a", "tab", { fetch: async () => { await claimAccount("a", "other", Date.now() + 16000); return { values: DEFAULT_PREFERENCES, version: 3 }; }, publish: async () => null }, () => {});
  await expect(sync.flush()).rejects.toThrow("locked"); expect((await readPreferences("a")).pending).toEqual({ theme: "dark" });
});

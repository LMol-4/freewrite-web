import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "./protocol";
import type { NoteRepository } from "./notes";
const repository = vi.fn<() => NoteRepository>(() => ({ list: async () => [], get: async () => null, body: async () => "" }));
let key = "current";
const auth = async (header: string | null) => header === "Bearer " + key ? { account_id: "alice", limited: false } : null;
const request = (message: unknown, headers = {}) => new Request("https://freewrite.test/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer current", ...headers }, body: JSON.stringify(message) });
beforeEach(() => { vi.stubEnv("APP_ORIGIN", "https://freewrite.test"); vi.stubEnv("APP_ALLOWED_ORIGINS", ""); key = "current"; vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
describe("MCP transport", () => {
  it("works with an actual SDK client, exposes only read tools, and rechecks rotated credentials", async () => {
    const client = new Client({ name: "test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("https://freewrite.test/mcp"), {
      requestInit: { headers: { Authorization: "Bearer current" } },
      fetch: async (url, options) => handleMcp(new Request(url, options), auth, repository),
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(["list_notes", "get_notes"]);
    expect(tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({ name: "list_notes", arguments: {} });
    expect(result.structuredContent).toEqual({ notes: [], next_cursor: null });
    expect(repository).toHaveBeenCalledWith("alice");
    key = "rotated";
    expect((await handleMcp(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }), auth, repository)).status).toBe(401);
    await client.close();
  });
  it("rejects foreign origins, missing auth, oversized bodies, writes, and invalid arguments", async () => {
    const message = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete_note", arguments: {} } };
    expect((await handleMcp(request(message, { Origin: "https://evil.test" }), auth, repository)).status).toBe(403);
    expect((await handleMcp(request(message, { Authorization: "" }), auth, repository)).status).toBe(401);
    const write = await handleMcp(request(message), auth, repository);
    expect((await write.json()).result.isError).toBe(true);
    expect(repository).not.toHaveBeenCalled();
    const oversized = await handleMcp(request({ ...message, padding: "x".repeat(20000) }), auth, repository);
    expect(oversized.status).toBe(413);
    const invalid = await handleMcp(request({ ...message, params: { name: "get_notes", arguments: { ids: [] } } }), auth, repository);
    expect((await invalid.json()).result.isError).toBe(true);
    expect(repository).not.toHaveBeenCalled();
  });
  it("returns rate limits, no-store headers, and no standalone stream", async () => {
    const limited = await handleMcp(request({}), async () => ({ account_id: "alice", limited: true }), repository);
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    const get = await handleMcp(new Request("https://freewrite.test/mcp", { headers: { Authorization: "Bearer current" } }), auth, repository);
    expect(get.status).toBe(405); expect(get.headers.get("cache-control")).toContain("no-store");
  });
});

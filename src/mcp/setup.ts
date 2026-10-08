export function setupPrompt(origin: string) {
  return [
    "Set up Freewrite's read-only MCP server in this agent's MCP client configuration.",
    "",
    "Read " + origin + "/docs/mcp-setup.md for instructions.",
    "Server: " + origin + "/mcp",
    "Transport: Streamable HTTP",
    "Authentication: Authorization: Bearer <FREEWRITE_API_KEY>",
    "",
    "Preserve existing MCP connections. Prefer user-level configuration. Guide me through entering my Freewrite key in this client's supported local secret configuration; do not ask me to paste it into chat, put it in project files, or repeat it in output.",
    "Verify the connection by listing up to five note previews. If a restart is required, explain how to finish verification afterward. If this client cannot use API-key-authenticated remote MCP servers, explain that limitation.",
  ].join("\n");
}

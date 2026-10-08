export class McpSetupError extends Error {}

export function keyError(error: unknown) {
  return error instanceof McpSetupError
    ? error.message
    : "Could not load your key. Please try again.";
}

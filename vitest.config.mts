import { defineConfig } from "vitest/config";

// Vitest's default include pattern also matches `*.spec.ts`, which collides
// with the Playwright specs under `e2e/` — this project's own convention is
// `.test.ts` for unit/integration tests, so scope to exactly that.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
  },
});

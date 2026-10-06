import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
const local = JSON.parse(readFileSync(".local-test/env.json", "utf8")) as Record<string, string>;
if (local.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321" || local.APP_ORIGIN !== "http://127.0.0.1:3000") throw Error("Run the disposable local-test harness first");
const stamp = JSON.parse(readFileSync(".local-test/build.json", "utf8"));
if (stamp.buildId !== readFileSync(".next/BUILD_ID", "utf8") || stamp.url !== local.NEXT_PUBLIC_SUPABASE_URL) throw Error("The production build is not verified for local tests");
Object.assign(process.env, local);
const appEnv = { ...local }; appEnv.LOCAL_TEST_SERVICE_KEY = "";
export default defineConfig({
  testDir: "./e2e", timeout: 45000, retries: process.env.CI ? 1 : 0, workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: local.APP_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: { command: "node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000", url: local.APP_ORIGIN, env: appEnv, reuseExistingServer: false, timeout: 120000 },
});

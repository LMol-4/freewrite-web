import { spawnSync } from "node:child_process";
import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
export function localClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url !== "http://127.0.0.1:55321" || process.env.LOCAL_TEST_MAIL_URL !== "http://127.0.0.1:55324") throw Error("Refusing non-disposable test target");
  const target = spawnSync("docker", ["inspect", "supabase_kong_freewrite-web-disposable", "--format", "{{json .}}"], { encoding: "utf8" });
  if (target.status !== 0) throw Error("Disposable gateway is unavailable");
  const gateway = JSON.parse(target.stdout);
  if (gateway.Config.Labels["com.supabase.cli.project"] !== "freewrite-web-disposable" || !gateway.NetworkSettings.Ports["8000/tcp"]?.some((binding: { HostPort: string }) => binding.HostPort === "55321")) throw Error("Unexpected fixture backend");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { admin: createClient<Database>(url, process.env.LOCAL_TEST_SERVICE_KEY!, options), user: () => createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options) };
}
export interface Account { id: string; email: string; password: string }
export async function login(page: Page, account: Account) {
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeVisible();
}
export const test = base.extend<{ account: Account; createAccount: () => Promise<Account> }>({
  createAccount: async ({}, provide) => {
    const { admin } = localClients(); const accounts: Account[] = [];
    await provide(async () => {
      const email = `test-${crypto.randomUUID()}@example.test`; const password = `Test-${crypto.randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? Error("Fixture creation failed");
      const account = { id: data.user.id, email, password }; accounts.push(account); return account;
    });
    for (const account of accounts) {
      async function removeFolder(prefix: string) {
        for (;;) {
          const { data: objects, error } = await admin.storage.from("notes").list(prefix, { limit: 100 });
          if (error) throw error; if (!objects?.length) return;
          for (const object of objects) {
            if (!object.id) await removeFolder(`${prefix}/${object.name}`);
            else { const result = await admin.storage.from("notes").remove([`${prefix}/${object.name}`]); if (result.error) throw result.error; }
          }
        }
      }
      await removeFolder(account.id);
      const { error } = await admin.auth.admin.deleteUser(account.id); if (error) throw error;
    }
  },
  account: async ({ createAccount }, provide) => { await provide(await createAccount()); },
  page: async ({ page, account }, provide) => { await login(page, account); await provide(page); },
});
export { expect };

export async function syncNow(page: Page) {
  const indicator = page.getByRole("button", { name: "Sync status", exact: true });
  if (await indicator.getAttribute("aria-expanded") !== "true") await indicator.click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await indicator.click();
}

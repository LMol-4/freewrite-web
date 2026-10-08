import { test, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { localClients } from "./fixtures";
async function emailLink(page: Page, email: string) {
  localClients();
  let html = "";
  await expect.poll(async () => {
    const response = await page.request.get(`http://127.0.0.1:55324/view/latest.html?query=${encodeURIComponent(`to:${email}`)}`);
    html = await response.text(); return response.ok() && html.includes("/auth/v1/verify");
  }).toBe(true);
  const encoded = html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1];
  if (!encoded) throw Error("Missing local confirmation link");
  const link = encoded.replaceAll("&amp;", "&");
  if (new URL(link).origin !== "http://127.0.0.1:55321") throw Error("Unexpected email link target");
  return link;
}
test("signup confirms with actual mail; used and malformed callbacks show retry guidance", async ({ page }) => {
  const email = `signup-${crypto.randomUUID()}@example.test`; const { admin, user } = localClients();
  try {
    await page.goto("/sign-up"); await page.getByLabel("email", { exact: true }).fill(email); await page.getByLabel("password", { exact: true }).fill("Fixture-password-123");
    await page.getByRole("button", { name: "sign up", exact: true }).click(); await expect(page.getByText(/check your email/)).toBeVisible();
    expect((await user().auth.signInWithPassword({ email, password: "Fixture-password-123" })).error).not.toBeNull();
    const link = await emailLink(page, email); await page.goto(link); await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeVisible();
    await page.goto(link); await expect(page.getByText("this link could not be used")).toBeVisible();
    await page.goto("/auth/callback?code=invalid&next=//example.com"); await expect(page).toHaveURL(/\/auth\/error$/);
  } finally {
    const { data } = await admin.auth.admin.listUsers(); const account = data.users.find(value => value.email === email); if (account) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull();
  }
});
test("recovery consumes actual mail in initiating browser and validates missing session", async ({ page }) => {
  const { admin, user } = localClients(); const email = `recovery-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Old-password-123", email_confirm: true }); expect(error).toBeNull();
  try {
    await page.goto("/reset-password"); await page.getByLabel("new password").fill("New-password-123"); await page.getByRole("button", { name: "save password" }).click(); await expect(page.getByText(/session is missing or expired/)).toBeVisible();
    await page.goto("/forgot-password"); await page.getByLabel("email").fill(email); await page.getByRole("button", { name: /send reset/ }).click(); await expect(page.getByText(/check your email/)).toBeVisible();
    const link = await emailLink(page, email); await page.goto(link); await expect(page).toHaveURL(/reset-password$/);
    await page.getByLabel("new password").fill("New-password-123"); await page.getByRole("button", { name: "save password" }).click(); await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeVisible();
    expect((await user().auth.signInWithPassword({ email, password: "New-password-123" })).error).toBeNull();
    await page.goto(link); await expect(page.getByText("this link could not be used")).toBeVisible();
  } finally { expect((await admin.auth.admin.deleteUser(data.user!.id)).error).toBeNull(); }
});
test("expired recovery mail does not create a reset session", async ({ page }) => {
  const { admin } = localClients(); const email = `expired-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Old-password-123", email_confirm: true }); expect(error).toBeNull();
  const id = data.user!.id;
  try {
    await page.goto("/forgot-password"); await page.getByLabel("email").fill(email); await page.getByRole("button", { name: /send reset/ }).click(); await expect(page.getByText(/check your email/)).toBeVisible();
    const link = await emailLink(page, email);
    const label = spawnSync("docker", ["inspect", "supabase_db_freewrite-web-disposable", "--format", '{{ index .Config.Labels "com.supabase.cli.project" }}'], { encoding: "utf8" });
    if (label.stdout.trim() !== "freewrite-web-disposable" || !/^[a-f0-9-]{36}$/.test(id)) throw Error("Unexpected local fixture target");
    const aged = spawnSync("docker", ["exec", "supabase_db_freewrite-web-disposable", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `update auth.users set recovery_sent_at = now() - interval '2 hours' where id = '${id}'`]);
    expect(aged.status).toBe(0); await page.goto(link); await expect(page.getByText("this link could not be used")).toBeVisible();
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});

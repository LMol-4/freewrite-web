import { test, expect } from "@playwright/test";
import { test as signedInTest } from "./fixtures";

test("landing and account navigation work on a small screen", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/");
  await expect(page).toHaveTitle("freewrite");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "freewrite");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("freewrite");
  expect(manifest.short_name).toBe("freewrite");
  await expect(page.locator(".public-links a").first()).toHaveText("by luke");
  await expect(page.getByRole("link", { name: "by luke" })).toHaveAttribute("href", "https://www.lukemolony.com");
  await expect(page.getByRole("heading", { name: "hi, this is freewrite." })).toBeVisible();
  await expect(page.getByRole("link", { name: "repo", exact: true })).toHaveAttribute("href", "https://github.com/LMol-4/freewrite-web");
  await expect(page.getByRole("link", { name: "fork of", exact: true })).toHaveAttribute("href", "https://github.com/farzaa/freewrite");
  await expect(page.locator("video")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("landing-mobile.png") });
  await page.getByRole("link", { name: "continue to app" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.locator(".public-links")).toHaveCount(0);
  await expect(page.getByText("hi, this is freewrite.")).toHaveCount(0);
  await page.getByRole("link", { name: "sign up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "sign up" })).toBeVisible();
  await expect(page.locator(".public-links")).toHaveCount(0);
  await expect(page.getByText("hi, this is freewrite.")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("signup-mobile.png") });
  await page.getByRole("link", { name: "sign in", exact: true }).click();
  await page.getByRole("link", { name: "forgot password?" }).click();
  await expect(page.getByRole("button", { name: "send reset link" })).toBeVisible();
  await expect(page.locator(".public-links")).toHaveCount(0);
  await expect(page.getByText("hi, this is freewrite.")).toHaveCount(0);
  await page.getByRole("link", { name: "back to freewrite" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: info.outputPath("landing-desktop.png") });
});

signedInTest("account entry routes return signed-in users to writing", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up", "/continue"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("textbox", { name: "Freewrite entry" })).toBeVisible();
  }
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "forgot password" })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "set a new password" })).toBeVisible();
  await expect(page.locator(".public-links")).toHaveCount(0);
  await expect(page.getByText("hi, this is freewrite.")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";

test("admin dashboard is gated behind a password", async ({ page }) => {
  await page.goto("/admin");
  // With no session cookie, the login form (password field) is shown instead of data.
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

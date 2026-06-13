import { test, expect } from "@playwright/test";

/**
 * Read-only smoke tests against a live deployment. These must NOT create leads,
 * send email, or mutate anything — they just confirm the money pages actually
 * load on the real deploy (catches env/config/build drift that mocked CI can't).
 */

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What are you looking to do?" })).toBeVisible();
  await expect(page.getByText("Purchase a home")).toBeVisible();
});

test("rates page loads", async ({ page }) => {
  await page.goto("/rates");
  await expect(page.getByText("NMLS #2004025", { exact: true })).toBeVisible();
});

test("apply (pre-qual) page loads", async ({ page }) => {
  await page.goto("/apply");
  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveURL(/\/apply/);
});

test("admin is gated behind a password", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

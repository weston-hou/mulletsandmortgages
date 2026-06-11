import { test, expect } from "@playwright/test";

test("privacy policy page renders", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Back/ })).toBeVisible();
});

test("terms page renders", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /Terms/ })).toBeVisible();
});

test("rates page renders the broker identity", async ({ page }) => {
  await page.route("**/api/rates**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: [] }) }),
  );
  await page.goto("/rates?quoted=1&email=jordan%40example.com");
  await expect(page.getByText("NMLS #2004025", { exact: true })).toBeVisible();
});

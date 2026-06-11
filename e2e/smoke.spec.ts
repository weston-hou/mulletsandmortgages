import { test, expect } from "@playwright/test";

test("landing page renders step 1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What are you looking to do?" })).toBeVisible();
  await expect(page.getByText("Purchase a home")).toBeVisible();
});

import { test, expect } from "@playwright/test";

/**
 * Read-only smoke tests against a live deployment. These must NOT create leads,
 * send email, or mutate anything.
 *
 * The site is currently HIBERNATED (see proxy.ts): every page serves the
 * contact card and every API route returns 503. When the site wakes up,
 * restore the pre-hibernation version of this file (git log e2e-smoke/).
 */

for (const path of ["/", "/rates", "/apply", "/admin"]) {
  test(`${path} serves the hibernation contact card`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText("NMLS #2004025")).toBeVisible();
    await expect(page.getByText("Equal Housing Lender")).toBeVisible();
    // The funnel must NOT be reachable while hibernated.
    await expect(page.getByText("What are you looking to do?")).toHaveCount(0);
  });
}

test("API routes are offline", async ({ request }) => {
  const res = await request.get("/api/rates");
  expect(res.status()).toBe(503);
});

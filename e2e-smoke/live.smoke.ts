import { test, expect } from "@playwright/test";

/**
 * Read-only smoke tests against a live deployment. These must NOT create leads,
 * send email, or mutate anything.
 *
 * The site is currently HIBERNATED (see proxy.ts): every page returns a blank
 * "offline" response (HTTP 503) with no business info, and every API route
 * returns 503. When the site wakes up, restore the pre-hibernation version of
 * this file (git log e2e-smoke/).
 */

for (const path of ["/", "/rates", "/apply", "/admin"]) {
  test(`${path} is hibernated (blank offline page, no business info)`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(503);
    // Nothing about the business — no contact card, no NMLS, no funnel.
    await expect(page.getByText("NMLS #2004025")).toHaveCount(0);
    await expect(page.getByText("Zachary Boyko")).toHaveCount(0);
    await expect(page.getByText("What are you looking to do?")).toHaveCount(0);
  });
}

test("API routes are offline", async ({ request }) => {
  const res = await request.get("/api/rates");
  expect(res.status()).toBe(503);
});

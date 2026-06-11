import { test, expect, type Page } from "@playwright/test";

// Intercept the backend so the funnel runs without real Supabase/Resend/Twilio.
async function mockApis(page: Page) {
  await page.route("**/api/leads", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "lead_1", success: true }) }),
  );
  await page.route("**/api/rates/quote", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  // /rates may fetch market estimates on load — keep it from hitting the network.
  await page.route("**/api/rates**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: [] }) }),
  );
}

test("landing funnel: fill all three steps and submit to /rates", async ({ page }) => {
  await mockApis(page);
  await page.goto("/");

  // Step 1 — purpose
  await page.getByRole("button", { name: /Purchase a home/ }).click();

  // Step 2 — loan details
  await expect(page.getByRole("heading", { name: "Loan details" })).toBeVisible();
  await page.getByPlaceholder("450,000").fill("450000");
  await page.getByPlaceholder("90,000").fill("90000");
  const selects = page.getByRole("combobox");
  await selects.nth(0).selectOption("Single family home"); // property type
  await selects.nth(1).selectOption("760+"); // credit score
  await page.getByRole("button", { name: "No" }).click(); // veteran status
  await selects.nth(2).selectOption("AZ"); // state
  await page.getByPlaceholder("85260").fill("85260");
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 3 — contact (email is the default preference: no phone/consent required)
  await expect(page.getByRole("heading", { name: /Where do we send your rates/ })).toBeVisible();
  await page.getByPlaceholder("John", { exact: true }).fill("Jordan");
  await page.getByPlaceholder("Smith").fill("Rivers");
  await page.getByPlaceholder("john@email.com").fill("jordan@example.com");

  await page.getByRole("button", { name: /See My Rates/ }).click();

  // Lands on the rates page with the quoted flag + email carried through.
  await expect(page).toHaveURL(/\/rates\?.*quoted=1/);
  await expect(page).toHaveURL(/email=jordan%40example\.com/);
});

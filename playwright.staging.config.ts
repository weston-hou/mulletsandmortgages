import { defineConfig, devices } from "@playwright/test";

/**
 * Integrated e2e against a STAGING deployment with REAL (sandboxed) services:
 * a test Supabase project, a real Resend key, and a capture inbox (Mailosaur).
 * Unlike the mocked e2e in ./e2e, nothing is faked here — this is what verifies
 * the genuine "submit -> real email -> click link -> see letter" journey.
 *
 * Required env (tests skip themselves if missing):
 *   STAGING_BASE_URL       e.g. https://staging-mulletsandmortgages.vercel.app
 *   STAGING_ADMIN_KEY      ADMIN_PASSWORD for the staging deploy (seeding/cleanup)
 *   MAILOSAUR_API_KEY      Mailosaur API key
 *   MAILOSAUR_SERVER_ID    Mailosaur server id (its inbox domain)
 *
 *   STAGING_BASE_URL=... MAILOSAUR_API_KEY=... MAILOSAUR_SERVER_ID=... npm run test:staging
 */
const baseURL = process.env.STAGING_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e-staging",
  testMatch: "**/*.staging.ts",
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 90_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Post-deploy smoke config — runs READ-ONLY checks against an already-deployed
 * URL (Vercel preview or production). No webServer: it hits a live deployment.
 * Set the target with SMOKE_BASE_URL (defaults to production).
 *
 *   SMOKE_BASE_URL=https://<preview>.vercel.app npm run test:smoke
 */
const baseURL = process.env.SMOKE_BASE_URL ?? "https://mulletsandmortgages.com";

export default defineConfig({
  testDir: "./e2e-smoke",
  testMatch: "**/*.smoke.ts",
  forbidOnly: !!process.env.CI,
  retries: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

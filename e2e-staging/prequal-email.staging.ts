import { test, expect } from "@playwright/test";

/**
 * Integrated pre-qual journey against a real STAGING deploy (real Supabase + real
 * Resend). Option A — no capture inbox: we trigger a real email send and assert
 * Resend accepts it, then follow the deterministic letter link and confirm the
 * hosted letter renders from the real database. (That the link is embedded in the
 * email body is proven separately, fast, by the unit test in app/api/prequal.)
 */

const { STAGING_BASE_URL, STAGING_ADMIN_KEY } = process.env;
const configured = Boolean(STAGING_BASE_URL);

test.describe("integrated pre-qual journey (staging)", () => {
  test.skip(!configured, "set STAGING_BASE_URL to run against a staging deploy");

  test("real pre-qual sends an email and renders the hosted letter", async ({ page, request }) => {
    // Reserved domain — Resend accepts it but nothing is delivered (we never read it).
    const email = `prequal-${Date.now()}@example.com`;

    // 1. Seed a lead through the real API on staging.
    const leadRes = await request.post(`${STAGING_BASE_URL}/api/leads`, {
      data: {
        firstName: "Stage",
        lastName: "Tester",
        email,
        loanPurpose: "Purchase a home",
        creditScore: "760+",
        preferredContact: "email",
      },
    });
    expect(leadRes.ok(), "lead creation should succeed").toBeTruthy();
    const { id: leadId } = await leadRes.json();

    // 2. Run the real DTI engine -> real Resend send. A 200 means the email was
    //    built and accepted by Resend (sendEmail would throw otherwise).
    const prequalRes = await request.post(`${STAGING_BASE_URL}/api/prequal`, {
      data: { lead_id: leadId, grossMonthlyIncome: 12000, requestedLoanAmount: 300000 },
    });
    expect(prequalRes.ok(), "prequal incl. real email send should succeed").toBeTruthy();
    const prequal = await prequalRes.json();
    expect(prequal.approved).toBe(true);
    expect(prequal.letterUrl).toContain(`/prequal/letter/${leadId}`);

    // 3. Follow the deterministic link the email carries — the hosted letter must
    //    render from the real (test) database.
    await page.goto(`${STAGING_BASE_URL}/prequal/letter/${leadId}`);
    await expect(page.getByText(/pre-qualified/i)).toBeVisible();
    await expect(page.getByText("Stage Tester")).toBeVisible();

    // 4. Best-effort cleanup of the test lead.
    if (STAGING_ADMIN_KEY) {
      await request
        .delete(`${STAGING_BASE_URL}/api/leads/${leadId}`, { headers: { "X-Admin-Key": STAGING_ADMIN_KEY } })
        .catch(() => {});
    }
  });
});

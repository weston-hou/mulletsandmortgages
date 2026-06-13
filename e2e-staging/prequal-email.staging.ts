import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The flagship integrated test: a real pre-qual submission produces a real email,
 * we read it from a capture inbox (Mailosaur), extract the letter link, and follow
 * it in the browser. This is the only tier that proves the whole email->click->letter
 * journey against real Supabase + Resend.
 */

const {
  STAGING_BASE_URL,
  STAGING_ADMIN_KEY,
  MAILOSAUR_API_KEY,
  MAILOSAUR_SERVER_ID,
} = process.env;

const configured = Boolean(STAGING_BASE_URL && MAILOSAUR_API_KEY && MAILOSAUR_SERVER_ID);

// Unique inbox address on the Mailosaur server — anything@<serverId>.mailosaur.net
const inbox = () => `prequal-${Date.now()}@${MAILOSAUR_SERVER_ID}.mailosaur.net`;

// Minimal Mailosaur REST client (avoids adding an SDK dependency).
async function waitForEmail(request: APIRequestContext, sentTo: string) {
  const res = await request.post(
    `https://mailosaur.com/api/messages/await?server=${MAILOSAUR_SERVER_ID}`,
    {
      headers: { Authorization: `Basic ${Buffer.from(`${MAILOSAUR_API_KEY}:`).toString("base64")}` },
      data: { sentTo },
      timeout: 60_000,
    },
  );
  expect(res.ok(), `Mailosaur await failed: ${res.status()}`).toBeTruthy();
  return res.json();
}

test.describe("integrated pre-qual email journey", () => {
  test.skip(!configured, "set STAGING_BASE_URL + MAILOSAUR_API_KEY + MAILOSAUR_SERVER_ID to run");

  test("real pre-qual emails a letter link that renders", async ({ page, request }) => {
    const email = inbox();

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
    expect(leadRes.ok()).toBeTruthy();
    const { id: leadId } = await leadRes.json();

    // 2. Run the real pre-qual engine -> sends the real email via Resend.
    const prequalRes = await request.post(`${STAGING_BASE_URL}/api/prequal`, {
      data: { lead_id: leadId, grossMonthlyIncome: 12000, requestedLoanAmount: 300000 },
    });
    expect(prequalRes.ok()).toBeTruthy();

    // 3. Read the email from the capture inbox and extract the letter link.
    const message = await waitForEmail(request, email);
    const letterLink: string | undefined = (message.html?.links ?? []).map((l: { href: string }) => l.href)
      .find((href: string) => href.includes(`/prequal/letter/${leadId}`));
    expect(letterLink, "email should contain the letter link").toBeTruthy();

    // 4. Follow the link like a borrower would — the hosted letter must render.
    await page.goto(letterLink!);
    await expect(page.getByText(/pre-qualified/i)).toBeVisible();
    await expect(page.getByText("Stage Tester")).toBeVisible();

    // 5. Best-effort cleanup of the test lead.
    if (STAGING_ADMIN_KEY) {
      await request.delete(`${STAGING_BASE_URL}/api/leads/${leadId}`, {
        headers: { "X-Admin-Key": STAGING_ADMIN_KEY },
      }).catch(() => {});
    }
  });
});

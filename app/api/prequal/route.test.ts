import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getById, update, convInsert, sendEmail, renderPrequalLetter } = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  convInsert: vi.fn(),
  sendEmail: vi.fn(),
  renderPrequalLetter: vi.fn(() => "<letter>"),
}));

vi.mock("@/lib/supabase", () => ({
  db: { leads: { getById, update }, conversations: { insert: convInsert } },
}));
// Keep the REAL buildPrequalEmailHtml so we verify the email actually carries
// the working letter link; only stub the network send.
vi.mock("@/lib/email", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/email")>()),
  sendEmail,
}));
vi.mock("@/lib/documents", () => ({ renderPrequalLetter }));

import { POST } from "./route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/prequal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead_1",
    first_name: "Jordan",
    last_name: "Rivers",
    email: "jordan@example.com",
    phone: "+16025551234",
    credit_score: "760",
    loan_purpose: "Purchase a home",
    state: "AZ",
    zip: "85254",
    property_type: "single_family",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  convInsert.mockResolvedValue({});
  sendEmail.mockResolvedValue("email_id");
});

describe("POST /api/prequal", () => {
  it("requires lead_id", async () => {
    const res = await POST(req({ grossMonthlyIncome: 10000 }));
    expect(res.status).toBe(400);
  });

  it("404s when the lead does not exist", async () => {
    getById.mockResolvedValue(null);
    const res = await POST(req({ lead_id: "missing", grossMonthlyIncome: 10000, requestedLoanAmount: 300000 }));
    expect(res.status).toBe(404);
  });

  it("approves a strong applicant, generates a letter, and emails it", async () => {
    getById.mockResolvedValue(lead());
    const res = await POST(req({ lead_id: "lead_1", grossMonthlyIncome: 10000, requestedLoanAmount: 300000 }));
    const data = await res.json();

    expect(data.approved).toBe(true);
    expect(data.fullyApproved).toBe(true);
    expect(data.approvedLoanAmount).toBe(300000);
    expect(data.letterUrl).toContain("/prequal/letter/lead_1");
    expect(renderPrequalLetter).toHaveBeenCalledTimes(1);
    expect(convInsert).toHaveBeenCalledTimes(1);
    // approval email subject signals the letter is ready
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/ready/i);
    // The emailed letter link is the deterministic /prequal/letter/{lead_id} URL —
    // this is the "click the link in the email" step, verified without a real inbox.
    expect(sendEmail.mock.calls[0][0].html).toContain("/prequal/letter/lead_1");
    // lead is moved to the pre_qual stage
    const completeUpdate = update.mock.calls.find((c) => c[1]?.prequal_complete);
    expect(completeUpdate?.[1].stage).toBe("pre_qual");
  });

  it("declines a sub-minimum credit score without generating a letter", async () => {
    getById.mockResolvedValue(lead({ credit_score: "550" }));
    const res = await POST(req({ lead_id: "lead_1", grossMonthlyIncome: 10000, requestedLoanAmount: 300000 }));
    const data = await res.json();

    expect(data.approved).toBe(false);
    expect(data.declineReason).toMatch(/credit score/i);
    expect(renderPrequalLetter).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1); // empathetic decline email
  });

  it("issues a partial-approval letter when the request exceeds what they qualify for", async () => {
    getById.mockResolvedValue(lead());
    const res = await POST(req({ lead_id: "lead_1", grossMonthlyIncome: 5000, requestedLoanAmount: 500000 }));
    const data = await res.json();

    expect(data.approved).toBe(true);
    expect(data.fullyApproved).toBe(false);
    expect(data.approvedLoanAmount).toBeLessThan(500000);
    expect(data.shortfallAmount).toBeGreaterThan(0);
    expect(renderPrequalLetter).toHaveBeenCalledTimes(1);
  });
});

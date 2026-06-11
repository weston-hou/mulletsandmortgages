import { describe, it, expect } from "vitest";
import { renderPrequalLetter, type PrequalLetterContext } from "./documents";

function ctx(overrides: Partial<PrequalLetterContext> = {}): PrequalLetterContext {
  return {
    leadId: "lead_1",
    recipient: { name: "Jordan Rivers", email: "jordan@example.com" },
    loanPurpose: "Purchase a home",
    approvedLoanAmount: 400_000,
    assumedMonthlyPayment: 2_797,
    stressRatePct: 7.5,
    maxMonthlyPayment: 4_500,
    state: "AZ",
    propertyType: "single_family",
    issuedDate: "June 11, 2026",
    expiryDate: "July 26, 2026",
    ...overrides,
  };
}

describe("renderPrequalLetter", () => {
  const html = renderPrequalLetter(ctx());

  it("addresses the borrower by name", () => {
    expect(html).toContain("Jordan Rivers");
  });

  it("shows the approved amount and assumed payment as currency", () => {
    expect(html).toContain("$400,000");
    expect(html).toContain("$2,797/mo");
  });

  it("quotes the stress rate to two decimals", () => {
    expect(html).toContain("7.50%");
  });

  it("states the issue and expiry dates", () => {
    expect(html).toContain("June 11, 2026");
    expect(html).toContain("July 26, 2026");
  });

  it("reflects the loan purpose and state", () => {
    const refi = renderPrequalLetter(ctx({ loanPurpose: "Refinance my current home", state: "TX" }));
    expect(refi).toContain("refinance my current home");
    expect(refi).toContain("TX");
  });
});

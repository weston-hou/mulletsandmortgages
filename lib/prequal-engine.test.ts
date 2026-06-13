import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  maxLoanAmount,
  runPrequalEngine,
  formatCurrency,
  formatPct,
  type PrequalInput,
} from "./prequal-engine";

const NO_DEBTS = { carLoan: 0, studentLoan: 0, currentMortgage: 0, otherDebt: 0 };

function input(overrides: Partial<PrequalInput> = {}): PrequalInput {
  return {
    grossMonthlyIncome: 10_000,
    debts: { ...NO_DEBTS },
    requestedLoanAmount: 300_000,
    creditScore: 760,
    loanPurpose: "purchase",
    state: "AZ",
    ...overrides,
  };
}

describe("monthlyPayment", () => {
  it("returns 0 for non-positive principal", () => {
    expect(monthlyPayment(0, 7.5)).toBe(0);
    expect(monthlyPayment(-1000, 7.5)).toBe(0);
  });

  it("computes a standard 30yr amortized P&I", () => {
    // $300k @ 7.5% / 360mo ≈ $2,097.64
    expect(monthlyPayment(300_000, 7.5)).toBeCloseTo(2097.64, 1);
  });

  it("scales linearly with principal at a fixed rate", () => {
    expect(monthlyPayment(600_000, 7.5)).toBeCloseTo(2 * monthlyPayment(300_000, 7.5), 6);
  });

  it("honors a custom term", () => {
    // 15yr payment is higher than 30yr for the same principal/rate
    expect(monthlyPayment(300_000, 7.5, 180)).toBeGreaterThan(monthlyPayment(300_000, 7.5, 360));
  });
});

describe("maxLoanAmount", () => {
  it("returns 0 for non-positive budget", () => {
    expect(maxLoanAmount(0, 7.5)).toBe(0);
    expect(maxLoanAmount(-100, 7.5)).toBe(0);
  });

  it("is the inverse of monthlyPayment", () => {
    const loan = 425_000;
    const pmt = monthlyPayment(loan, 7.5);
    expect(maxLoanAmount(pmt, 7.5)).toBeCloseTo(loan, 4);
  });
});

describe("runPrequalEngine — hard declines", () => {
  it("declines below the minimum credit score (580)", () => {
    const r = runPrequalEngine(input({ creditScore: 579 }));
    expect(r.approved).toBe(false);
    expect(r.approvedLoanAmount).toBe(0);
    expect(r.declineReason).toMatch(/credit score/i);
  });

  it("accepts exactly the minimum credit score (580)", () => {
    const r = runPrequalEngine(input({ creditScore: 580, requestedLoanAmount: 100_000 }));
    expect(r.approved).toBe(true);
  });

  it("declines zero/negative income", () => {
    const r = runPrequalEngine(input({ grossMonthlyIncome: 0 }));
    expect(r.approved).toBe(false);
    expect(r.declineReason).toMatch(/income/i);
  });

  it("declines when existing debts already exceed the 45% DTI limit", () => {
    const r = runPrequalEngine(
      input({ grossMonthlyIncome: 3_000, debts: { ...NO_DEBTS, carLoan: 1_400 } }),
    );
    expect(r.approved).toBe(false);
    expect(r.maxMonthlyPayment).toBe(0);
    expect(r.dtiUsed).toBeCloseTo(1_400 / 3_000, 6);
    expect(r.declineReason).toMatch(/DTI/i);
  });
});

describe("runPrequalEngine — approvals", () => {
  it("approves the full requested amount when it fits the budget", () => {
    const r = runPrequalEngine(input({ grossMonthlyIncome: 10_000, requestedLoanAmount: 400_000 }));
    expect(r.approved).toBe(true);
    expect(r.approvedLoanAmount).toBe(400_000);
    expect(r.shortfallAmount).toBeUndefined();
    expect(r.stressRatePct).toBe(7.5);
  });

  it("sets maxMonthlyPayment to 45% of income minus debts", () => {
    const r = runPrequalEngine(
      input({ grossMonthlyIncome: 8_000, debts: { ...NO_DEBTS, studentLoan: 500 } }),
    );
    // 8000 * 0.45 - 500 = 3100
    expect(r.maxMonthlyPayment).toBe(3_100);
  });

  it("keeps the resulting DTI at or under 45%", () => {
    const r = runPrequalEngine(input({ grossMonthlyIncome: 10_000, requestedLoanAmount: 400_000 }));
    expect(r.dtiUsed).toBeLessThanOrEqual(0.45);
    // assumed P&I on $400k @ 7.5% ≈ $2,797
    expect(r.assumedMonthlyPayment).toBeCloseTo(2797, 0);
  });
});

describe("runPrequalEngine — under-qualified", () => {
  it("caps the approved amount and reports the shortfall", () => {
    const r = runPrequalEngine(input({ grossMonthlyIncome: 5_000, requestedLoanAmount: 500_000 }));
    expect(r.approved).toBe(false);
    // qualified amount is floored to the nearest $1,000 and is less than requested
    expect(r.approvedLoanAmount).toBeLessThan(500_000);
    expect(r.approvedLoanAmount % 1_000).toBe(0);
    expect(r.shortfallAmount).toBe(500_000 - r.approvedLoanAmount);
  });
});

describe("runPrequalEngine — refinance excludes the current mortgage", () => {
  // Regression for the refinance double-count bug: a refi's new loan replaces the
  // existing mortgage, so the current payment must not count against the DTI budget.
  const base = input({
    grossMonthlyIncome: 8_000,
    debts: { ...NO_DEBTS, currentMortgage: 2_000 },
    requestedLoanAmount: 250_000,
  });

  it("counts the current mortgage as debt for a purchase", () => {
    const r = runPrequalEngine({ ...base, loanPurpose: "Purchase a home" });
    expect(r.totalMonthlyDebt).toBe(2_000);
  });

  it("excludes the current mortgage for a refinance", () => {
    const r = runPrequalEngine({ ...base, loanPurpose: "Refinance my current home" });
    expect(r.totalMonthlyDebt).toBe(0);
  });

  it("also excludes it for a cash-out refinance", () => {
    const r = runPrequalEngine({ ...base, loanPurpose: "Cash-out refinance" });
    expect(r.totalMonthlyDebt).toBe(0);
  });

  it("gives a refinancer a larger housing budget than the same purchase borrower", () => {
    const purchase = runPrequalEngine({ ...base, loanPurpose: "Purchase a home" });
    const refi = runPrequalEngine({ ...base, loanPurpose: "Refinance my current home" });
    expect(refi.maxMonthlyPayment).toBeGreaterThan(purchase.maxMonthlyPayment);
  });
});

describe("formatters", () => {
  it("formats whole-dollar currency", () => {
    expect(formatCurrency(643_000)).toBe("$643,000");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats a percentage to two decimals", () => {
    expect(formatPct(7.5)).toBe("7.50%");
    expect(formatPct(6)).toBe("6.00%");
  });
});

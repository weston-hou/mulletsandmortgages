/**
 * lib/prequal-engine.ts
 * DTI-based pre-qualification engine for Mullets & Mortgages.
 *
 * Math:
 *   - Max DTI: 45%
 *   - Monthly housing budget = (gross monthly income × 0.45) − existing monthly debts
 *   - Back-solve loan amount using 30yr fixed at a conservative "stress rate"
 *   - Stress rate: current market estimate + 0.5% buffer (hardcoded, Zach can update)
 *   - Letter quotes max loan amount, assumed P&I, and the rate ceiling
 */

export interface DebtBreakdown {
  carLoan:       number;   // monthly payment
  studentLoan:   number;   // monthly payment
  currentMortgage: number; // monthly payment (0 if selling or none)
  otherDebt:     number;   // monthly payment
}

export interface PrequalInput {
  grossMonthlyIncome: number;
  debts: DebtBreakdown;
  requestedLoanAmount: number;
  creditScore: number;       // numeric (e.g. 760)
  loanPurpose: string;
  state: string;
}

export interface PrequalResult {
  approved: boolean;
  approvedLoanAmount: number;    // what they actually qualify for
  requestedLoanAmount: number;   // what they asked for
  maxMonthlyPayment: number;     // P&I ceiling (housing budget)
  assumedMonthlyPayment: number; // P&I on approved amount
  stressRatePct: number;         // rate ceiling quoted on letter (e.g. 7.5)
  totalMonthlyDebt: number;      // all existing monthly obligations
  dtiUsed: number;               // actual DTI at approved amount (as decimal, e.g. 0.42)
  declineReason?: string;        // set when approved=false
  shortfallAmount?: number;      // how far the requested amount exceeds what they qualify for
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DTI          = 0.45;
const STRESS_RATE_PCT  = 7.5;   // % — the rate ceiling quoted on the letter
const LOAN_TERM_MONTHS = 360;   // 30yr fixed
const MIN_CREDIT_SCORE = 580;   // FHA floor

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Monthly P&I payment for a loan amount at a given annual rate.
 */
export function monthlyPayment(principal: number, annualRatePct: number, termMonths = LOAN_TERM_MONTHS): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  return principal * r / (1 - Math.pow(1 + r, -termMonths));
}

/**
 * Max loan amount that fits within a given monthly payment at the stress rate.
 */
export function maxLoanAmount(maxMonthlyPayment: number, annualRatePct: number, termMonths = LOAN_TERM_MONTHS): number {
  if (maxMonthlyPayment <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  return maxMonthlyPayment * (1 - Math.pow(1 + r, -termMonths)) / r;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function runPrequalEngine(input: PrequalInput): PrequalResult {
  const { grossMonthlyIncome, debts, requestedLoanAmount, creditScore, loanPurpose } = input;

  // On a refinance the new loan replaces the existing mortgage, so that payment
  // goes away at closing — don't count it as ongoing debt. (The back-solved
  // assumed payment below already represents the post-refi housing cost; counting
  // both would underwrite the borrower as paying two mortgages at once.)
  const isRefi = /refinance/i.test(loanPurpose ?? "");
  const housingDebt = isRefi ? 0 : debts.currentMortgage;
  const totalMonthlyDebt =
    debts.carLoan + debts.studentLoan + housingDebt + debts.otherDebt;

  // Hard declines
  if (creditScore < MIN_CREDIT_SCORE) {
    return {
      approved: false,
      approvedLoanAmount: 0,
      requestedLoanAmount,
      maxMonthlyPayment: 0,
      assumedMonthlyPayment: 0,
      stressRatePct: STRESS_RATE_PCT,
      totalMonthlyDebt,
      dtiUsed: 0,
      declineReason: `Credit score of ${creditScore} is below the minimum of ${MIN_CREDIT_SCORE} required for most loan programs.`,
    };
  }

  if (grossMonthlyIncome <= 0) {
    return {
      approved: false,
      approvedLoanAmount: 0,
      requestedLoanAmount,
      maxMonthlyPayment: 0,
      assumedMonthlyPayment: 0,
      stressRatePct: STRESS_RATE_PCT,
      totalMonthlyDebt,
      dtiUsed: 0,
      declineReason: "Income must be greater than zero.",
    };
  }

  // Maximum housing payment (the "front-end" budget within 45% DTI)
  const maxHousingBudget = grossMonthlyIncome * MAX_DTI - totalMonthlyDebt;

  if (maxHousingBudget <= 0) {
    const dti = totalMonthlyDebt / grossMonthlyIncome;
    return {
      approved: false,
      approvedLoanAmount: 0,
      requestedLoanAmount,
      maxMonthlyPayment: 0,
      assumedMonthlyPayment: 0,
      stressRatePct: STRESS_RATE_PCT,
      totalMonthlyDebt,
      dtiUsed: dti,
      declineReason: `Existing monthly debts of $${totalMonthlyDebt.toFixed(0)} already exceed the 45% DTI limit on an income of $${grossMonthlyIncome.toFixed(0)}/month.`,
    };
  }

  // Max loan amount at the stress rate
  const qualifiedLoanAmount = Math.floor(maxLoanAmount(maxHousingBudget, STRESS_RATE_PCT) / 1000) * 1000;

  const approved = qualifiedLoanAmount >= requestedLoanAmount;
  const approvedLoanAmount = approved ? requestedLoanAmount : qualifiedLoanAmount;
  const assumedPayment = monthlyPayment(approvedLoanAmount, STRESS_RATE_PCT);
  const dtiUsed = (totalMonthlyDebt + assumedPayment) / grossMonthlyIncome;

  return {
    approved,
    approvedLoanAmount,
    requestedLoanAmount,
    maxMonthlyPayment: Math.round(maxHousingBudget),
    assumedMonthlyPayment: Math.round(assumedPayment),
    stressRatePct: STRESS_RATE_PCT,
    totalMonthlyDebt,
    dtiUsed,
    shortfallAmount: approved ? undefined : Math.ceil(requestedLoanAmount - qualifiedLoanAmount),
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function formatPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

"use client";

/**
 * app/apply/page.tsx
 * Self-serve onboarding portal — mulletsandmortgages.com/apply
 *
 * For leads who came in through referrals, QR codes, social bios, or word of
 * mouth. Collects the full loan scenario + contact info, creates a lead record
 * in Supabase, sends a welcome email, and confirms pre-qual next steps.
 *
 * Steps:
 *   1. Loan purpose
 *   2. Property details (price, type, state, zip, down payment)
 *   3. Credit & income (credit score, employment, income, liabilities)
 *   4. Contact info (name, email, phone, SMS consent)
 *   5. Confirmation
 */

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LICENSED_STATES_SENTENCE } from "@/lib/licensing";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOAN_PURPOSES = [
  { label: "Purchase a home",            icon: "🏠" },
  { label: "Refinance my current home",  icon: "🔄" },
  { label: "Cash-out refinance",         icon: "💵" },
  { label: "Investment property",        icon: "📈" },
  { label: "Not sure yet",              icon: "🤔" },
];

const PRICE_RANGES = [
  "Under $200k", "$200k – $300k", "$300k – $400k",
  "$400k – $600k", "$600k – $800k", "$800k – $1M", "Over $1M",
];

const CREDIT_RANGES = [
  { label: "Excellent (760+)",    value: "760+" },
  { label: "Very Good (720–759)", value: "720–759" },
  { label: "Good (680–719)",      value: "680–719" },
  { label: "Fair (640–679)",      value: "640–679" },
  { label: "Needs Work (<640)",   value: "<640" },
  { label: "Not sure",           value: "Unknown" },
];

const PROPERTY_TYPES = [
  "Single Family", "Condo", "Townhouse", "Multi-Family", "Mobile Home", "Land",
];

const DOWN_PAYMENTS = [
  "0% (VA/USDA)", "3%", "3.5% (FHA)", "5%", "10%", "15%", "20%", "20%+",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID",
  "IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS",
  "MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  loanPurpose:   string;
  estimatedPrice: string;
  propertyType:  string;
  state:         string;
  zip:           string;
  downPayment:   string;
  creditScore:   string;
  employment:    string;
  income:        string;        // annual gross
  carLoan:       string;        // monthly payment
  studentLoan:   string;        // monthly payment
  currentMortgage: string;      // monthly payment
  sellCurrentHome: string;      // "yes" | "no" | ""
  otherDebt:     string;        // monthly payment
  requestedLoanAmount: string;  // dollar amount they want pre-qual for
  firstName:     string;
  lastName:      string;
  email:         string;
  phone:         string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function e164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1 mb-8">
      <div
        className="bg-amber-400 h-1 rounded-full transition-all duration-500"
        style={{ width: `${(step / total) * 100}%` }}
      />
    </div>
  );
}

function OptionButton({
  selected, onClick, icon, label, sub,
}: {
  selected: boolean; onClick: () => void; icon?: string; label: string; sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center gap-3 ${
        selected
          ? "border-amber-400 bg-amber-400/10 text-white"
          : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {icon && <span className="text-lg">{icon}</span>}
      <div>
        <div className="font-medium text-sm">{label}</div>
        {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
      </div>
      {selected && <span className="ml-auto text-amber-400 text-sm">✓</span>}
    </button>
  );
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {sub && <p className="text-zinc-500 text-sm mt-1">{sub}</p>}
    </div>
  );
}

function NavButtons({
  onBack, onNext, nextLabel = "Continue →", disabled = false, loading = false,
}: {
  onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; loading?: boolean;
}) {
  return (
    <div className="flex gap-3 mt-6">
      {onBack && (
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all text-sm font-medium"
        >
          ← Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled || loading}
        className="flex-1 py-3 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-colors disabled:opacity-40"
      >
        {loading ? "Submitting…" : nextLabel}
      </button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

function ApplyPageInner() {
  const searchParams = useSearchParams();

  // Pre-populate from URL params (passed from email agent links)
  const prefill: FormState = {
    loanPurpose:    searchParams.get("loanPurpose")    ?? "",
    estimatedPrice: searchParams.get("estimatedPrice") ?? "",
    propertyType:   searchParams.get("propertyType")   ?? "",
    state:          searchParams.get("state")          ?? "",
    zip:            searchParams.get("zip")            ?? "",
    downPayment:    searchParams.get("downPayment")    ?? "",
    creditScore:    searchParams.get("creditScore") ?? searchParams.get("credit_score") ?? "",
    employment:     "",
    income:         "",
    carLoan:        "",
    studentLoan:    "",
    currentMortgage: "",
    sellCurrentHome: "",
    otherDebt:      "",
    requestedLoanAmount: searchParams.get("requestedLoanAmount") ?? "",
    firstName:      searchParams.get("firstName")      ?? "",
    lastName:       searchParams.get("lastName")       ?? "",
    email:          searchParams.get("email")          ?? "",
    phone:          searchParams.get("phone")          ?? "",
  };

  // Determine starting step — skip steps already answered
  function getStartStep(f: FormState): number {
    if (!f.loanPurpose) return 1;
    if (!f.estimatedPrice || !f.creditScore || !f.state || !f.zip || !f.propertyType || !f.downPayment) return 2;
    return 3; // jump straight to employment/income since contact info is pre-filled
  }

  const isPreFilled = !!(searchParams.get("email") && searchParams.get("firstName"));
  const [step, setStep]       = useState(() => getStartStep(prefill));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [, setLeadId]         = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);

  const [form, setForm] = useState<FormState>(prefill);

  const update = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const next = () => {
    setError("");
    // If pre-filled from email link, skip contact step (step 4) — we already have their info
    if (isPreFilled && step === 3) {
      handleSubmitDirect();
      return;
    }
    setStep(s => Math.min(s + 1, TOTAL_STEPS + 1));
  };
  const back = () => { setError(""); setStep(s => Math.max(s - 1, 1)); };

  // ── Submit ──────────────────────────────────────────────────────────────────

  // Parse a dollar/number string to a number
  const parseDollar = (s: string) => parseFloat(s.replace(/[^0-9.]/g, "")) || 0;

  // Called when submitting from step 3 with pre-filled contact info (email preference leads)
  const handleSubmitDirect = async () => {
    if (!prefill.email || !prefill.firstName) { setStep(4); return; } // fallback to contact step
    if (!form.income || !form.requestedLoanAmount) {
      setError("Please fill in your income and the loan amount you need.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Upsert lead (may already exist from landing page)
      const leadsRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName:      form.firstName.trim(),
          lastName:       form.lastName.trim(),
          email:          form.email.trim().toLowerCase(),
          phone:          form.phone ? e164(form.phone) : undefined,
          loanPurpose:    form.loanPurpose,
          estimatedPrice: form.estimatedPrice,
          propertyType:   form.propertyType,
          state:          form.state,
          zip:            form.zip,
          downPayment:    form.downPayment,
          creditScore:    form.creditScore,
          prequal_employment:   form.employment,
          prequal_income:       String(parseDollar(form.income) / 12),
          prequal_credit_score: form.creditScore,
          prequal_zip:          form.zip,
          preferredContact: "email",
          utm_source: "email_agent",
          utm_medium: "prequal_link",
        }),
      });
      if (!leadsRes.ok) throw new Error("Lead create failed");
      const leadData = await leadsRes.json();
      const lid = leadData.id;
      setLeadId(lid);

      // Run pre-qual engine
      const grossMonthly = parseDollar(form.income) / 12;
      const mortgagePayment = form.sellCurrentHome === "yes" ? 0 : parseDollar(form.currentMortgage);
      const prequalRes = await fetch("/api/prequal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id:              lid,
          grossMonthlyIncome:   grossMonthly,
          carLoan:              parseDollar(form.carLoan),
          studentLoan:          parseDollar(form.studentLoan),
          currentMortgage:      mortgagePayment,
          otherDebt:            parseDollar(form.otherDebt),
          requestedLoanAmount:  parseDollar(form.requestedLoanAmount),
        }),
      });
      const prequalData = await prequalRes.json();
      if (!prequalData.approved) {
        setError(prequalData.declineReason ?? "We were unable to issue a pre-qualification based on the numbers provided. Zach will follow up shortly.");
        setLoading(false);
        return;
      }
      setStep(TOTAL_STEPS + 1);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!smsConsent) { setError("Please agree to receive text messages to continue."); return; }

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) { setError("Please enter a valid 10-digit phone number."); return; }
    if (!form.email.includes("@")) { setError("Please enter a valid email address."); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name:    form.firstName.trim(),
          last_name:     form.lastName.trim(),
          email:         form.email.trim().toLowerCase(),
          phone:         e164(form.phone),
          loan_purpose:  form.loanPurpose,
          estimated_price: form.estimatedPrice,
          property_type: form.propertyType,
          state:         form.state,
          zip:           form.zip,
          down_payment:  form.downPayment,
          credit_score:  form.creditScore,
          // Pre-qual fields collected inline
          prequal_employment: form.employment,
          prequal_income:     form.income,
          // prequal_liabilities collected via /api/prequal
          prequal_credit_score: form.creditScore,
          prequal_zip:    form.zip,
          utm_source:    "direct",
          utm_medium:    "apply",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setLeadId(data.id);
      next(); // → confirmation step
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-4">
        <div className="max-width-2xl mx-auto flex items-center gap-3">
          <span className="text-2xl">✂️</span>
          <div>
            <div className="font-black text-white text-base leading-tight">
              Mullets <span className="text-amber-400">&</span> Mortgages
            </div>
            <div className="text-xs text-zinc-500">NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        {step <= TOTAL_STEPS && (
          <>
            <div className="text-xs text-zinc-500 mb-2 font-medium">
              Step {step} of {TOTAL_STEPS}
            </div>
            <ProgressBar step={step} total={TOTAL_STEPS} />
          </>
        )}

        {/* ── Step 1: Loan purpose ── */}
        {step === 1 && (
          <div>
            <StepHeading
              title="What are you looking to do?"
              sub="We'll match you with the right loan programs based on your goal."
            />
            <div className="space-y-2.5">
              {LOAN_PURPOSES.map(({ label, icon }) => (
                <OptionButton
                  key={label}
                  icon={icon}
                  label={label}
                  selected={form.loanPurpose === label}
                  onClick={() => update("loanPurpose", label)}
                />
              ))}
            </div>
            <NavButtons
              onNext={next}
              disabled={!form.loanPurpose}
            />
          </div>
        )}

        {/* ── Step 2: Property details ── */}
        {step === 2 && (
          <div>
            <StepHeading
              title="Tell me about the property"
              sub="Approximate numbers are fine — we're just getting a baseline."
            />
            <div className="space-y-4">

              {/* Price range */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2 font-medium">
                  {form.loanPurpose === "Refinance my current home" || form.loanPurpose === "Cash-out refinance"
                    ? "Estimated home value"
                    : "Estimated purchase price"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRICE_RANGES.map(r => (
                    <OptionButton
                      key={r} label={r}
                      selected={form.estimatedPrice === r}
                      onClick={() => update("estimatedPrice", r)}
                    />
                  ))}
                </div>
              </div>

              {/* Property type */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2 font-medium">Property type</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROPERTY_TYPES.map(t => (
                    <OptionButton
                      key={t} label={t}
                      selected={form.propertyType === t}
                      onClick={() => update("propertyType", t)}
                    />
                  ))}
                </div>
              </div>

              {/* State + zip */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">State</label>
                  <select
                    value={form.state}
                    onChange={e => update("state", e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Select…</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">ZIP code</label>
                  <input
                    type="text" inputMode="numeric" maxLength={5}
                    value={form.zip}
                    onChange={e => update("zip", e.target.value.replace(/\D/g, ""))}
                    placeholder="85001"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                  />
                </div>
              </div>

              {/* Down payment (purchase only) */}
              {!["Refinance my current home", "Cash-out refinance"].includes(form.loanPurpose) && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-2 font-medium">Down payment</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DOWN_PAYMENTS.map(d => (
                      <OptionButton
                        key={d} label={d}
                        selected={form.downPayment === d}
                        onClick={() => update("downPayment", d)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <NavButtons
              onBack={back} onNext={next}
              disabled={!form.estimatedPrice || !form.propertyType || !form.state || form.zip.length < 5}
            />
          </div>
        )}

        {/* ── Step 3: Income, debts & loan amount ── */}
        {step === 3 && (
          <div>
            <StepHeading
              title="Income & monthly debts"
              sub="We use this to calculate exactly what you qualify for. Nothing is pulled from your credit yet."
            />
            <div className="space-y-4">

              {/* Credit score — show only if not pre-filled */}
              {!prefill.creditScore && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-2 font-medium">Credit score range</label>
                  <div className="space-y-2">
                    {CREDIT_RANGES.map(({ label, value }) => (
                      <OptionButton
                        key={value} label={label}
                        selected={form.creditScore === value}
                        onClick={() => update("creditScore", value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Employment */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Employment status</label>
                <select
                  value={form.employment}
                  onChange={e => update("employment", e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400"
                >
                  <option value="">Select…</option>
                  <option>W-2 Employee (full-time)</option>
                  <option>W-2 Employee (part-time)</option>
                  <option>Self-employed / 1099</option>
                  <option>Business owner (2+ years)</option>
                  <option>Retired</option>
                  <option>Military / VA</option>
                  <option>Not currently employed</option>
                </select>
              </div>

              {/* Annual income */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Annual gross income <span className="text-zinc-600">(before taxes)</span>
                </label>
                <input
                  type="text" inputMode="numeric"
                  value={form.income}
                  onChange={e => update("income", e.target.value)}
                  placeholder="e.g. 85000"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                />
              </div>

              {/* Loan amount requested */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  How much do you want to be pre-qualified for?
                </label>
                <input
                  type="text" inputMode="numeric"
                  value={form.requestedLoanAmount}
                  onChange={e => update("requestedLoanAmount", e.target.value)}
                  placeholder="e.g. 350000"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                />
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500 mb-3">Monthly debt payments — enter 0 if none</p>

                {/* Car loan */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Car loan payment</label>
                    <input
                      type="text" inputMode="numeric"
                      value={form.carLoan}
                      onChange={e => update("carLoan", e.target.value)}
                      placeholder="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Student loan payment</label>
                    <input
                      type="text" inputMode="numeric"
                      value={form.studentLoan}
                      onChange={e => update("studentLoan", e.target.value)}
                      placeholder="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                    />
                  </div>
                </div>

                {/* Current mortgage */}
                <div className="mb-3">
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Current mortgage payment <span className="text-zinc-600">(0 if renting or none)</span></label>
                  <input
                    type="text" inputMode="numeric"
                    value={form.currentMortgage}
                    onChange={e => update("currentMortgage", e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                  />
                </div>

                {/* Selling current home? */}
                {parseFloat(form.currentMortgage || "0") > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs text-zinc-400 mb-2 font-medium">Are you planning to sell your current home before closing?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["Yes", "No"].map(opt => (
                        <OptionButton
                          key={opt} label={opt}
                          selected={form.sellCurrentHome === opt.toLowerCase()}
                          onClick={() => update("sellCurrentHome", opt.toLowerCase())}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other debt */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Other monthly debt <span className="text-zinc-600">(credit cards, personal loans, etc.)</span></label>
                  <input
                    type="text" inputMode="numeric"
                    value={form.otherDebt}
                    onChange={e => update("otherDebt", e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
            <NavButtons
              onBack={back} onNext={next}
              nextLabel={isPreFilled ? "Get My Pre-Qual Letter →" : "Next"}
              disabled={!form.employment || !form.income || !form.requestedLoanAmount}
              loading={loading}
            />
          </div>
        )}

        {/* ── Step 4: Contact info ── */}
        {step === 4 && (
          <div>
            <StepHeading
              title="Last step — how do we reach you?"
              sub="Zach will personally review your scenario and reach out within a few hours."
            />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">First name</label>
                  <input
                    type="text" autoComplete="given-name"
                    value={form.firstName}
                    onChange={e => update("firstName", e.target.value)}
                    placeholder="Jane"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Last name</label>
                  <input
                    type="text" autoComplete="family-name"
                    value={form.lastName}
                    onChange={e => update("lastName", e.target.value)}
                    placeholder="Smith"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Email address</label>
                <input
                  type="email" inputMode="email" autoComplete="email"
                  value={form.email}
                  onChange={e => update("email", e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Phone number</label>
                <input
                  type="tel" inputMode="tel" autoComplete="tel"
                  value={form.phone}
                  onChange={e => update("phone", formatPhone(e.target.value))}
                  placeholder="(602) 555-1234"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 placeholder-zinc-600"
                />
              </div>

              {/* SMS consent */}
              <label className="flex items-start gap-3 mt-2 cursor-pointer group">
                <div
                  onClick={() => setSmsConsent(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                    smsConsent ? "bg-amber-400 border-amber-400" : "border-zinc-600 group-hover:border-zinc-400"
                  }`}
                >
                  {smsConsent && <span className="text-black text-xs font-bold">✓</span>}
                </div>
                <span className="text-xs text-zinc-400 leading-relaxed">
                  I agree to receive automated text messages from BrokerBoyko LLC / Mullets & Mortgages
                  at the number above regarding my mortgage inquiry. Msg & data rates may apply.
                  Reply STOP to opt out at any time. Consent is not a condition of purchase.{" "}
                  <a href="/privacy" className="text-amber-400 underline" target="_blank">Privacy Policy</a>
                </span>
              </label>

              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>
            <NavButtons
              onBack={back}
              onNext={handleSubmit}
              nextLabel="Get My Pre-Qual →"
              disabled={!form.firstName || !form.lastName || !form.email || form.phone.replace(/\D/g, "").length !== 10}
              loading={loading}
            />
          </div>
        )}

        {/* ── Step 5: Confirmation ── */}
        {step === TOTAL_STEPS + 1 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-black text-white mb-3">
              You&apos;re in the queue, {form.firstName}!
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              Zach will personally review your scenario and reach out via text within a few hours.
              Keep an eye on your phone — the next message will be from him.
            </p>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-left max-w-sm mx-auto mb-6 space-y-2">
              <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">What happens next</div>
              {[
                { icon: "📱", text: "Zach texts you to confirm your scenario" },
                { icon: "📄", text: "We run a soft credit check (no impact to your score)" },
                { icon: "✅", text: "You get your pre-qualification letter" },
                { icon: "🏠", text: "Start shopping with confidence" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-zinc-300">
                  <span>{icon}</span> {text}
                </div>
              ))}
            </div>

            <div className="text-zinc-600 text-xs">
              Questions? Text or call Zach directly at{" "}
              <a href="tel:6024101334" className="text-amber-400">(602) 410-1334</a>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-6 mt-8">
        <div className="max-w-lg mx-auto text-center text-xs text-zinc-600 leading-relaxed">
          Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533<br />
          Equal Housing Lender · Licensed in {LICENSED_STATES_SENTENCE}<br />
          <a href="/privacy" className="text-zinc-500 hover:text-zinc-300 underline">Privacy Policy</a>
          {" · "}
          <a href="/terms" className="text-zinc-500 hover:text-zinc-300 underline">Terms</a>
        </div>
      </footer>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense>
      <ApplyPageInner />
    </Suspense>
  );
}

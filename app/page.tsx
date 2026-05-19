"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { captureTrackingContext, getTrackingContext, track, identify } from "@/lib/analytics";

const LOAN_PURPOSES = [
  { label: "Purchase a home", icon: "🏠" },
  { label: "Refinance my current home", icon: "🔄" },
  { label: "Cash-out refinance", icon: "💵" },
  { label: "Investment property", icon: "📈" },
  { label: "Not sure yet", icon: "🤔" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID",
  "IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS",
  "MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY",
];

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const stepStartTime = useRef<number>(Date.now());

  const [form, setForm] = useState({
    loanPurpose: "",
    estimatedPrice: "",
    creditScore: "",
    state: "",
    zip: "",
    propertyType: "",
    downPayment: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [smsConsent, setSmsConsent] = useState(false);

  // Capture UTM + tracking context on mount
  useEffect(() => {
    captureTrackingContext();
    track("page_viewed", { page: "landing" });
  }, []);

  // Track time spent on each step
  useEffect(() => {
    stepStartTime.current = Date.now();
    track("step_viewed", { step });
  }, [step]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const advanceStep = (nextStep: number) => {
    const timeOnStep = Date.now() - stepStartTime.current;
    track("step_completed", { step, next_step: nextStep, time_on_step_ms: timeOnStep, ...form });
    setStep(nextStep);
  };

  const handlePurposeSelect = (purpose: string) => {
    update("loanPurpose", purpose);
    track("loan_purpose_selected", { loan_purpose: purpose });
    setTimeout(() => advanceStep(2), 100);
  };

  const handleSubmit = async () => {
    setLoading(true);
    identify(form.email, {
      name: `${form.firstName} ${form.lastName}`,
      phone: form.phone,
      loan_purpose: form.loanPurpose,
      estimated_price: form.estimatedPrice,
      credit_score: form.creditScore,
      state: form.state,
      zip: form.zip,
      property_type: form.propertyType,
      down_payment: form.downPayment,
    });
    track("lead_submitted", { ...form });

    // POST to /api/leads to persist in Supabase, then trigger SMS agent
    try {
      const trackingCtx = getTrackingContext();
      const leadsRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          loanPurpose: form.loanPurpose,
          estimatedPrice: form.estimatedPrice,
          creditScore: form.creditScore,
          state: form.state,
          zip: form.zip,
          propertyType: form.propertyType,
          downPayment: form.downPayment,
          ...trackingCtx,
        }),
      });

      // Trigger SMS agent for new lead (fire-and-forget — non-blocking)
      if (leadsRes.ok) {
        const leadData = await leadsRes.json();
        if (leadData.id) {
          fetch("/api/agent/sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "trigger", lead_id: leadData.id }),
          }).catch((e) => console.error("SMS trigger failed:", e));
        }
      }
    } catch (e) {
      // Non-fatal — still redirect to rates even if Supabase is not configured
      console.error("Failed to persist lead:", e);
    }

    // Pass form data to results page via query params (non-sensitive only)
    const params = new URLSearchParams({
      purpose: form.loanPurpose,
      price: form.estimatedPrice,
      credit: form.creditScore,
      state: form.state,
      zip: form.zip,
      type: form.propertyType,
      down: form.downPayment,
      name: form.firstName,
    });
    router.push(`/rates?${params.toString()}`);
  };

  const inputClass =
    "w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 text-base transition-all duration-200";
  const selectClass =
    "w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base transition-all duration-200 appearance-none cursor-pointer";
  const canAdvanceStep2 =
    form.estimatedPrice && form.creditScore && form.state && form.zip && form.propertyType && form.downPayment;
  const canSubmit =
    form.firstName && form.lastName && form.email && form.phone && smsConsent;

  return (
    <main className="min-h-screen gradient-bg flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✂️</span>
          <span className="font-bold text-white text-lg tracking-tight">
            Mullets <span className="text-amber-400">&</span> Mortgages
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-zinc-400 text-sm">
          <span className="flex items-center gap-1">
            <span className="text-green-400">●</span> NMLS #2004025
          </span>
          <span className="text-zinc-700">|</span>
          <span>150+ Lenders</span>
          <span className="text-zinc-700">|</span>
          <span>All 48 States</span>
        </div>
      </nav>

      <section className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-16">
        {/* Hero */}
        <div className="max-w-2xl w-full mx-auto text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 rounded-full px-4 py-1.5 text-amber-400 text-sm font-medium mb-5">
            <span>✂️</span>
            <span>Business in the front. Savings in the back.</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white leading-tight mb-4">
            See real rates from<br />
            <span className="gradient-text">150+ lenders.</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Independent broker. 60 seconds. No credit pull. No commitment. Just the best rate available for your situation.
          </p>
        </div>

        {/* Form Card */}
        <div className="w-full max-w-lg mx-auto bg-zinc-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 card-glow border border-zinc-800 animate-slide-up delay-200" style={{ opacity: 0 }}>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-zinc-500 mb-2">
              <span>Step {step} of 3</span>
              <span>{step === 1 ? "Purpose" : step === 2 ? "Loan details" : "Your info"}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* ── Step 1: Loan purpose ── */}
          {step === 1 && (
            <div className="space-y-3 animate-slide-up">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white mb-1">What are you looking to do?</h2>
                <p className="text-zinc-500 text-sm">No credit pull required to see rates.</p>
              </div>
              {LOAN_PURPOSES.map(({ label, icon }) => (
                <button
                  key={label}
                  onClick={() => handlePurposeSelect(label)}
                  className="w-full text-left px-4 py-3.5 rounded-xl border border-zinc-700 bg-zinc-800/50 text-white hover:border-amber-400/60 hover:bg-zinc-800 transition-all duration-200 font-medium text-sm flex items-center gap-3"
                >
                  <span className="text-xl">{icon}</span>
                  <span>{label}</span>
                  <span className="ml-auto text-zinc-600">→</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: Loan details ── */}
          {step === 2 && (
            <div className="space-y-4 animate-slide-up">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-white mb-1">Loan details</h2>
                <p className="text-zinc-500 text-sm">All estimates — nothing is locked in.</p>
              </div>

              {/* Row: Price + Down payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Home price / loan amount</label>
                  <select className={selectClass} value={form.estimatedPrice} onChange={(e) => update("estimatedPrice", e.target.value)}>
                    <option value="">Select range</option>
                    <option>Under $200k</option>
                    <option>$200k – $400k</option>
                    <option>$400k – $600k</option>
                    <option>$600k – $800k</option>
                    <option>$800k – $1M</option>
                    <option>Over $1M</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Down payment</label>
                  <select className={selectClass} value={form.downPayment} onChange={(e) => update("downPayment", e.target.value)}>
                    <option value="">Select</option>
                    <option>Less than 5%</option>
                    <option>5% – 9%</option>
                    <option>10% – 14%</option>
                    <option>15% – 19%</option>
                    <option>20%+</option>
                    <option>N/A (refi)</option>
                  </select>
                </div>
              </div>

              {/* Property type */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Property type</label>
                <select className={selectClass} value={form.propertyType} onChange={(e) => update("propertyType", e.target.value)}>
                  <option value="">Select type</option>
                  <option>Single family home</option>
                  <option>Townhouse / condo</option>
                  <option>Multi-family (2–4 units)</option>
                  <option>Manufactured home</option>
                  <option>Investment property</option>
                </select>
              </div>

              {/* Credit score */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Estimated credit score</label>
                <select className={selectClass} value={form.creditScore} onChange={(e) => update("creditScore", e.target.value)}>
                  <option value="">Select range</option>
                  <option>760+</option>
                  <option>720 – 759</option>
                  <option>680 – 719</option>
                  <option>640 – 679</option>
                  <option>600 – 639</option>
                  <option>Below 600</option>
                  <option>Not sure</option>
                </select>
              </div>

              {/* Row: State + Zip */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">State</label>
                  <select className={selectClass} value={form.state} onChange={(e) => update("state", e.target.value)}>
                    <option value="">State</option>
                    {US_STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Zip code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className={inputClass}
                    placeholder="85260"
                    value={form.zip}
                    onChange={(e) => update("zip", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)} className="flex-1 py-3.5 rounded-xl border border-zinc-700 text-zinc-400 font-medium text-sm hover:border-zinc-500 hover:text-white transition-all duration-200">
                  Back
                </button>
                <button
                  onClick={() => advanceStep(3)}
                  disabled={!canAdvanceStep2}
                  className="flex-grow py-3.5 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Contact info ── */}
          {step === 3 && (
            <div className="space-y-4 animate-slide-up">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-white mb-1">Where do we send your rates?</h2>
                <p className="text-zinc-500 text-sm">Zach personally reviews every inquiry — no robo-calls.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">First name</label>
                  <input type="text" className={inputClass} placeholder="John" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Last name</label>
                  <input type="text" className={inputClass} placeholder="Smith" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Email address</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="john@email.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  onBlur={() => form.email && track("email_entered", { has_email: true })}
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Phone number</label>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder="(602) 555-0123"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>

              {/* SMS consent checkbox — required by TCPA + Twilio A2P */}
              <div className="flex items-start gap-3 bg-zinc-800/50 border border-zinc-700 rounded-xl p-3.5">
                <input
                  id="sms-consent"
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => {
                    setSmsConsent(e.target.checked);
                    track("sms_consent_checked", { checked: e.target.checked });
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-amber-400 accent-amber-400 flex-shrink-0 cursor-pointer"
                />
                <label htmlFor="sms-consent" className="text-xs text-zinc-400 leading-relaxed cursor-pointer">
                  Yes, I agree to receive automated text messages and AI-generated voice calls from Zach Boyko (BrokerBoyko LLC) about my mortgage inquiry.{" "}
                  <span className="text-zinc-500">Message frequency varies. Msg &amp; data rates may apply. Reply HELP for help or STOP to cancel anytime.</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(2)} className="flex-1 py-3.5 rounded-xl border border-zinc-700 text-zinc-400 font-medium text-sm hover:border-zinc-500 hover:text-white transition-all duration-200">
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !canSubmit}
                  className="flex-grow py-3.5 rounded-xl bg-amber-400 text-black font-bold text-sm hover:bg-amber-300 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Fetching your rates…
                    </>
                  ) : (
                    "See My Rates →"
                  )}
                </button>
              </div>

              <p className="text-xs text-zinc-600 text-center pt-1">
                <a href="/privacy" className="text-zinc-500 underline hover:text-zinc-400">Privacy Policy</a>
                {" · "}
                <a href="/terms" className="text-zinc-500 underline hover:text-zinc-400">Terms of Service</a>
              </p>
            </div>
          )}
        </div>

        {/* Social proof */}
        <div className="mt-10 max-w-lg w-full mx-auto animate-fade-in delay-500" style={{ opacity: 0 }}>
          <div className="mullet-divider mb-6" />
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { stat: "150+", label: "Lenders shopped for you" },
              { stat: "48 States", label: "Licensed across the lower 48" },
              { stat: "No BS", label: "Honest advice, every time" },
            ].map(({ stat, label }) => (
              <div key={stat}>
                <div className="text-amber-400 font-bold text-lg">{stat}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-600">
          <div>Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · Equal Housing Lender</div>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
            <a href="https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/2380533" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">NMLS Consumer Access</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

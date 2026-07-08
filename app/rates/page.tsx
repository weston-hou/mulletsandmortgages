"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { LICENSED_STATES } from "@/lib/licensing";

import type { RateCard } from "@/app/api/rates/route";

// ─── Price range → numeric bounds ────────────────────────────────────────────

interface PriceBounds { min: number | null; max: number | null }

function parsePriceBounds(price: string): PriceBounds {
  const map: Record<string, PriceBounds> = {
    "Under $200k":   { min: null,    max: 200000  },
    "$200k – $400k": { min: 200000,  max: 400000  },
    "$400k – $600k": { min: 400000,  max: 600000  },
    "$600k – $800k": { min: 600000,  max: 800000  },
    "$800k – $1M":   { min: 800000,  max: 1000000 },
    "Over $1M":      { min: 1000000, max: null     },
  };
  return map[price] ?? { min: null, max: null };
}

function zillowUrl(zip: string, price: string): string {
  const base = `https://www.zillow.com/homes/for_sale/${zip}_rb/`;
  if (!price) return base;
  const { min, max } = parsePriceBounds(price);
  if (min === null && max === null) return base;
  const minPart = min ?? 0;
  const maxPart = max ?? 9999999;
  return `${base}${minPart}-${maxPart}_price/`;
}

function redfinUrl(zip: string, price: string): string {
  const base = `https://www.redfin.com/zipcode/${zip}/filter/`;
  if (!price) return `https://www.redfin.com/zipcode/${zip}`;
  const { min, max } = parsePriceBounds(price);
  const parts: string[] = ["property-type=house,condo,townhouse"];
  if (min !== null) parts.push(`min-price=${min}`);
  if (max !== null) parts.push(`max-price=${max}`);
  return base + parts.join(",");
}

// ─── Page content ─────────────────────────────────────────────────────────────

function RatesContent() {
  const params = useSearchParams();
  const name = params.get("name") ?? "there";
  const purpose = params.get("purpose") ?? "";
  const price = params.get("price") ?? "";
  const credit = params.get("credit") ?? "";
  const state = params.get("state") ?? "";
  const zip = params.get("zip") ?? "";
  const propertyType = params.get("type") ?? "";
  const email = params.get("email") ?? "";
  const quoted = params.get("quoted") === "1";

  const [cards, setCards]     = useState<RateCard[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [asOf, setAsOf]       = useState("");

  useEffect(() => {
    track("rates_page_viewed", { purpose, price, credit, state, zip, property_type: propertyType });
  }, [purpose, price, credit, state, zip, propertyType]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (purpose) q.set("purpose", purpose);
    if (price)   q.set("price",   price);
    if (credit)  q.set("credit",  credit);
    fetch(`/api/rates?${q}`)
      .then(r => r.json())
      .then(data => {
        setCards(data.cards ?? []);
        setAsOf(data.as_of ?? "");
      })
      .catch(() => {})
      .finally(() => setRatesLoading(false));
  }, [purpose, price, credit]);

  return (
    <main className="min-h-screen gradient-bg flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">✂️</span>
            <span className="font-bold text-white text-lg tracking-tight">
              Mullets <span className="text-amber-400">&</span> Mortgages
            </span>
          </Link>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-zinc-400 text-sm">
          <span className="text-green-400">●</span>
          <span>NMLS #2004025</span>
        </div>
      </nav>

      <section className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="mb-8 animate-slide-up">
          {quoted && (
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm font-medium mb-4">
              <span>✉️</span>
              <span>
                Your personalized rates are on their way — check {email ? <><strong>{email}</strong></> : "your inbox"} in a few minutes
              </span>
            </div>
          )}
          {!quoted && (
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 text-green-400 text-sm font-medium mb-4">
              <span>✓</span>
              <span>You&apos;re in — Zach is reviewing your scenario</span>
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
            {quoted ? `While you wait, ${name}...` : `Hey ${name}, here are your options`}
          </h1>
          <p className="text-zinc-400">
            Based on: <span className="text-white">{purpose}</span>
            {price && <> · <span className="text-white">{price}</span></>}
            {credit && <> · <span className="text-white">{credit} credit</span></>}
            {state && <> · <span className="text-white">{state}{zip ? ` ${zip}` : ""}</span></>}
          </p>
        </div>

        {/* Market rates disclaimer */}
        {quoted && (
          <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-4 flex gap-3 items-start">
            <span className="text-lg mt-0.5">📊</span>
            <div>
              <p className="text-white text-sm font-semibold mb-0.5">These are general market rates</p>
              <p className="text-zinc-400 text-sm">The rates below are pulled from today&apos;s market averages. Your <strong className="text-amber-400">personalized rates — priced to your exact loan</strong> — are in the email we just sent you.</p>
            </div>
          </div>
        )}

        {/* Rate cards */}
        <div className="space-y-3 mb-10">
          {ratesLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 animate-pulse">
                  <div className="h-8 bg-zinc-800 rounded w-24 mb-2" />
                  <div className="h-4 bg-zinc-800 rounded w-40" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {asOf && (
                <div className="text-xs text-zinc-600 mb-3">
                  General market snapshot as of {new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Your custom rates are in the email
                </div>
              )}
              {cards.map((r) => (
                <div
                  key={r.type}
                  onClick={() => track("rate_card_clicked", { rate: r.rate, type: r.type })}
                  className={`rounded-xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
                    r.highlight
                      ? "border-amber-400/40 bg-amber-400/5 card-glow"
                      : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {r.badge && (
                        <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${
                          r.highlight
                            ? "bg-amber-400/20 text-amber-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {r.highlight && "⭐ "}{r.badge}
                        </div>
                      )}
                      <div className="text-3xl font-black text-white">{r.rate.toFixed(3)}%</div>
                      <div className="text-zinc-400 text-sm mt-0.5">
                        {r.type} · APR {r.apr.toFixed(3)}%
                        {r.note && <span className="text-zinc-600 ml-1">({r.note})</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {r.payment && (
                        <>
                          <div className="text-zinc-500 text-xs">Est. payment</div>
                          <div className="text-white font-semibold">${r.payment.toLocaleString()}/mo</div>
                        </>
                      )}
                      <div className="text-zinc-600 text-xs mt-1">{r.points} pts</div>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-zinc-700 mt-3 leading-relaxed">
                Rates shown are indicative based on current market benchmarks. Actual rate depends on full credit review and lender pricing. Not a commitment to lend.
              </p>
            </>
          )}
        </div>

        {/* CTA — Apply / Talk to Zach */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12 animate-slide-up delay-200" style={{ opacity: 0 }}>
          <a
            href="https://prod.lendingpad.com/adaxa-home/pos#/?loid=c4d5c50b-bce5-4a80-8f65-2bac9bb4d12f"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("apply_clicked", { source: "rates_page" })}
            className="block w-full py-4 rounded-xl bg-amber-400 text-black font-bold text-center hover:bg-amber-300 transition-all duration-200 animate-pulse-glow"
          >
            Start Full Application →
          </a>
          <a
            href="tel:6024101334"
            onClick={() => track("call_clicked", { source: "rates_page" })}
            className="block w-full py-4 rounded-xl border border-zinc-600 text-white font-bold text-center hover:border-amber-400/50 hover:bg-zinc-800 transition-all duration-200"
          >
            📞 Call Zach Directly
          </a>
        </div>

        {/* Homes section — zip + price range filtered */}
        {zip && (
          <div className="mb-12 animate-slide-up delay-300" style={{ opacity: 0 }}>
            <div className="mullet-divider mb-6" />
            <h2 className="text-xl font-bold text-white mb-1">Homes near {zip}</h2>
            <p className="text-zinc-500 text-sm mb-4">
              {price
                ? <>Filtered to <span className="text-white">{price}</span> — see what&apos;s in your range.</>
                : "See what's available in your area."}
            </p>
            <div className="space-y-3">
              <a
                href={zillowUrl(zip, price)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("homes_link_clicked", { platform: "zillow", zip, price })}
                className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 hover:border-amber-400/40 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏠</span>
                  <div>
                    <div className="text-white font-semibold">Browse on Zillow</div>
                    <div className="text-zinc-500 text-sm mt-0.5">
                      {price ? `Homes ${price} in ${zip}` : `All homes for sale in ${zip}`}
                    </div>
                  </div>
                </div>
                <span className="text-amber-400 group-hover:translate-x-1 transition-transform duration-200">→</span>
              </a>
              <a
                href={redfinUrl(zip, price)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("homes_link_clicked", { platform: "redfin", zip, price })}
                className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 hover:border-amber-400/40 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔴</span>
                  <div>
                    <div className="text-white font-semibold">Browse on Redfin</div>
                    <div className="text-zinc-500 text-sm mt-0.5">
                      {price ? `Homes ${price} in ${zip}` : `All homes for sale in ${zip}`}
                    </div>
                  </div>
                </div>
                <span className="text-amber-400 group-hover:translate-x-1 transition-transform duration-200">→</span>
              </a>
            </div>
          </div>
        )}

        {/* Trust signals */}
        <div className="mullet-divider mb-6" />
        <div className="grid grid-cols-3 gap-4 text-center mb-8">
          {[
            { stat: "150+", label: "Lenders shopped" },
            { stat: `${LICENSED_STATES.length}`, label: "States covered" },
            { stat: "No pull", label: "Soft inquiry only" },
          ].map(({ stat, label }) => (
            <div key={stat}>
              <div className="text-amber-400 font-bold text-lg">{stat}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
            </div>
          ))}
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

export default function RatesPage() {
  return (
    <Suspense>
      <RatesContent />
    </Suspense>
  );
}

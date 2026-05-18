"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

// Placeholder rate cards — replace with live Optimal Blue API response
const PLACEHOLDER_RATES = [
  { lender: "Best Available Rate", rate: "6.375%", apr: "6.512%", type: "30-yr Fixed", payment: "—", points: "0", highlight: true },
  { lender: "Low Points Option", rate: "6.500%", apr: "6.621%", type: "30-yr Fixed", payment: "—", points: "0", highlight: false },
  { lender: "15-Year Option", rate: "5.875%", apr: "5.991%", type: "15-yr Fixed", payment: "—", points: "0", highlight: false },
  { lender: "ARM Option", rate: "5.750%", apr: "6.134%", type: "7/1 ARM", payment: "—", points: "0", highlight: false },
];

function RatesContent() {
  const params = useSearchParams();
  const name = params.get("name") ?? "there";
  const purpose = params.get("purpose") ?? "";
  const price = params.get("price") ?? "";
  const credit = params.get("credit") ?? "";
  const state = params.get("state") ?? "";
  const zip = params.get("zip") ?? "";
  const propertyType = params.get("type") ?? "";

  const [obReady] = useState(false); // flip to true when OB credentials are configured

  useEffect(() => {
    track("rates_page_viewed", { purpose, price, credit, state, zip, property_type: propertyType });
  }, [purpose, price, credit, state, zip, propertyType]);

  return (
    <main className="min-h-screen gradient-bg flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <span className="text-2xl">✂️</span>
            <span className="font-bold text-white text-lg tracking-tight">
              Mullets <span className="text-amber-400">&</span> Mortgages
            </span>
          </a>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-zinc-400 text-sm">
          <span className="text-green-400">●</span>
          <span>NMLS #2004025</span>
        </div>
      </nav>

      <section className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="mb-8 animate-slide-up">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 text-green-400 text-sm font-medium mb-4">
            <span>✓</span>
            <span>You're in — Zach is reviewing your scenario</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
            Hey {name}, here are your options
          </h1>
          <p className="text-zinc-400">
            Based on: <span className="text-white">{purpose}</span>
            {price && <> · <span className="text-white">{price}</span></>}
            {credit && <> · <span className="text-white">{credit} credit</span></>}
            {state && <> · <span className="text-white">{state}{zip ? ` ${zip}` : ""}</span></>}
          </p>
        </div>

        {/* Rate cards */}
        <div className="space-y-3 mb-10 animate-slide-up delay-100" style={{ opacity: 0 }}>
          {!obReady && (
            <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3 text-amber-400 text-sm flex items-center gap-2 mb-4">
              <span>⚡</span>
              <span>Live rates from 150+ lenders loading soon — Zach will personally send your exact options within the hour.</span>
            </div>
          )}

          {PLACEHOLDER_RATES.map((r) => (
            <div
              key={r.type + r.rate}
              onClick={() => track("rate_card_clicked", { rate: r.rate, type: r.type })}
              className={`rounded-xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
                r.highlight
                  ? "border-amber-400/40 bg-amber-400/5 card-glow"
                  : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  {r.highlight && (
                    <div className="inline-flex items-center gap-1 bg-amber-400/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full mb-2">
                      ⭐ Best Match
                    </div>
                  )}
                  <div className="text-3xl font-black text-white">{r.rate}</div>
                  <div className="text-zinc-400 text-sm mt-0.5">{r.type} · APR {r.apr}</div>
                </div>
                <div className="text-right">
                  <div className="text-zinc-500 text-xs">Points</div>
                  <div className="text-white font-semibold">{r.points}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA — Apply / Talk to Zach */}
        <div className="grid sm:grid-cols-2 gap-4 mb-12 animate-slide-up delay-200" style={{ opacity: 0 }}>
          <a
            href={`https://prod.lendingpad.com/adaxa-home/pos#/?loid=c4d5c50b-bce5-4a80-8f65-2bac9bb4d12f`}
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

        {/* Homes section — zip-based */}
        {zip && (
          <div className="mb-12 animate-slide-up delay-300" style={{ opacity: 0 }}>
            <div className="mullet-divider mb-6" />
            <h2 className="text-xl font-bold text-white mb-1">Homes near {zip}</h2>
            <p className="text-zinc-500 text-sm mb-4">See what's available in your price range.</p>

            {/* Zillow embed — replace with real API when ready */}
            <a
              href={`https://www.zillow.com/homes/for_sale/${zip}_rb/`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("homes_link_clicked", { zip })}
              className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 hover:border-amber-400/40 transition-all duration-200 group"
            >
              <div>
                <div className="text-white font-semibold">Browse homes for sale in {zip}</div>
                <div className="text-zinc-500 text-sm mt-0.5">Opens Zillow · {price ? `filtered to ${price}` : "all price ranges"}</div>
              </div>
              <span className="text-amber-400 group-hover:translate-x-1 transition-transform duration-200">→</span>
            </a>
          </div>
        )}

        {/* Trust signals */}
        <div className="mullet-divider mb-6" />
        <div className="grid grid-cols-3 gap-4 text-center mb-8">
          {[
            { stat: "150+", label: "Lenders shopped" },
            { stat: "48", label: "States covered" },
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

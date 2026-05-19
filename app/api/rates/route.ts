/**
 * app/api/rates/route.ts
 * GET /api/rates?purpose=...&price=...&credit=...&down=...
 *
 * Returns current mortgage rates derived from Mortgage News Daily data.
 * Fetches MND's public rates page, parses benchmark rates, then applies
 * credit score and loan type adjustments to produce realistic rate cards.
 *
 * Cached for 1 hour server-side. Falls back to static rates if fetch fails.
 *
 * When BankingBridge / Optimal Blue credentials are configured, this route
 * will swap in live personalized pricing — the response shape stays the same.
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateCard {
  type:       string;   // "30-yr Fixed", "15-yr Fixed", "FHA 30-yr", "7/1 ARM"
  rate:       number;   // e.g. 6.75
  apr:        number;   // rate + spread
  points:     number;   // 0
  payment:    number | null;  // monthly P&I for loan amount if calculable
  highlight:  boolean;
  badge?:     string;   // "Best Match", "Lowest Payment", etc.
  note?:      string;   // "Based on current market rates"
}

interface RatesResponse {
  cards:      RateCard[];
  source:     "live" | "fallback";
  as_of:      string;   // ISO timestamp
  disclaimer: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: { data: { base30: number; base15: number; baseFHA: number; baseARM: number }; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── MND scraper ─────────────────────────────────────────────────────────────

async function fetchMNDRates(): Promise<{ base30: number; base15: number; baseFHA: number; baseARM: number }> {
  // Check cache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetch("https://www.mortgagenewsdaily.com/mortgage-rates", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MortgageRatesBot/1.0)",
        "Accept": "text/html",
      },
      next: { revalidate: 3600 }, // Next.js cache
    });

    if (!res.ok) throw new Error(`MND fetch failed: ${res.status}`);
    const html = await res.text();

    // Parse rates from the page — MND embeds them in readable text
    const extract = (pattern: RegExp): number | null => {
      const m = html.match(pattern);
      if (!m) return null;
      const val = parseFloat(m[1]);
      return isNaN(val) ? null : val;
    };

    // MND renders rates in structured sections we can pattern-match
    const base30  = extract(/30\s*Year\s*Fixed[^%\d]*?([\d.]+)%/i)  ?? 6.75;
    const base15  = extract(/15\s*Year\s*Fixed[^%\d]*?([\d.]+)%/i)  ?? 6.25;
    const baseFHA = extract(/FHA[^%\d]*?([\d.]+)%/i)                ?? (base30 - 0.25);
    const baseARM = extract(/7\/[16]\s*(?:SOFR\s*)?ARM[^%\d]*?([\d.]+)%/i) ?? (base30 - 0.75);

    const data = { base30, base15, baseFHA, baseARM };
    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    console.error("[rates] MND fetch failed, using fallback:", err);
    // Return reasonable fallback rates
    return { base30: 6.75, base15: 6.25, baseFHA: 6.50, baseARM: 6.00 };
  }
}

// ─── Rate adjustments ─────────────────────────────────────────────────────────

function creditAdjustment(credit: string): number {
  const map: Record<string, number> = {
    "760+":    -0.125,
    "720–759":  0,
    "680–719":  0.125,
    "640–679":  0.375,
    "<640":     0.75,
    "Unknown":  0.125,
  };
  return map[credit] ?? 0;
}

function loanPurposeAdjustment(purpose: string): number {
  if (purpose.includes("Investment")) return 0.50;
  if (purpose.includes("Cash-out"))   return 0.25;
  if (purpose.includes("Refinance"))  return 0.125;
  return 0;
}

function estimateLoanAmount(price: string, down: string): number | null {
  const priceMap: Record<string, number> = {
    "Under $200k":      175000,
    "$200k – $300k":    250000,
    "$300k – $400k":    350000,
    "$400k – $600k":    500000,
    "$600k – $800k":    700000,
    "$800k – $1M":      900000,
    "Over $1M":        1250000,
  };
  const downMap: Record<string, number> = {
    "0% (VA/USDA)": 0,
    "3%":           0.03,
    "3.5% (FHA)":   0.035,
    "5%":           0.05,
    "10%":          0.10,
    "15%":          0.15,
    "20%":          0.20,
    "20%+":         0.22,
  };
  const p = priceMap[price];
  if (!p) return null;
  const d = downMap[down] ?? 0.10;
  return Math.round(p * (1 - d));
}

function monthlyPayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// ─── Build rate cards ─────────────────────────────────────────────────────────

function buildCards(
  base: { base30: number; base15: number; baseFHA: number; baseARM: number },
  credit: string,
  purpose: string,
  price: string,
  down: string,
): RateCard[] {
  const creditAdj  = creditAdjustment(credit);
  const purposeAdj = loanPurposeAdjustment(purpose);
  const loanAmt    = estimateLoanAmount(price, down);
  const isFHADown  = down === "3.5% (FHA)" || (loanAmt && loanAmt < 472030);
  const isVA       = down === "0% (VA/USDA)" && purpose.includes("Purchase");

  const adj = (base: number, extra = 0) =>
    Math.round((base + creditAdj + purposeAdj + extra) * 1000) / 1000;

  const cards: RateCard[] = [];

  // 30-yr Fixed — always show
  const r30 = adj(base.base30);
  cards.push({
    type:      "30-yr Fixed",
    rate:      r30,
    apr:       Math.round((r30 + 0.12) * 1000) / 1000,
    points:    0,
    payment:   loanAmt ? monthlyPayment(loanAmt, r30, 30) : null,
    highlight: true,
    badge:     "Best Match",
  });

  // 15-yr Fixed
  const r15 = adj(base.base15);
  cards.push({
    type:    "15-yr Fixed",
    rate:    r15,
    apr:     Math.round((r15 + 0.10) * 1000) / 1000,
    points:  0,
    payment: loanAmt ? monthlyPayment(loanAmt, r15, 15) : null,
    highlight: false,
    badge:   "Build equity faster",
  });

  // FHA — show if low down payment or credit isn't great
  if (isFHADown || ["640–679", "<640", "Unknown"].includes(credit)) {
    const rFHA = adj(base.baseFHA, -0.125); // FHA usually slightly lower
    cards.push({
      type:    "FHA 30-yr",
      rate:    rFHA,
      apr:     Math.round((rFHA + 0.35) * 1000) / 1000, // MIP adds to APR
      points:  0,
      payment: loanAmt ? monthlyPayment(loanAmt, rFHA, 30) : null,
      highlight: false,
      badge:   "Low down payment",
      note:    "Includes mortgage insurance",
    });
  }

  // VA — show if 0% down and purchase
  if (isVA) {
    const rVA = adj(base.base30, -0.375);
    cards.push({
      type:    "VA 30-yr",
      rate:    rVA,
      apr:     Math.round((rVA + 0.10) * 1000) / 1000,
      points:  0,
      payment: loanAmt ? monthlyPayment(loanAmt, rVA, 30) : null,
      highlight: false,
      badge:   "No PMI required",
    });
  }

  // 7/1 ARM — show if good credit and higher price range
  const highPrice = ["$400k – $600k", "$600k – $800k", "$800k – $1M", "Over $1M"].includes(price);
  if (highPrice && ["760+", "720–759"].includes(credit)) {
    const rARM = adj(base.baseARM);
    cards.push({
      type:    "7/1 ARM",
      rate:    rARM,
      apr:     Math.round((rARM + 0.20) * 1000) / 1000,
      points:  0,
      payment: loanAmt ? monthlyPayment(loanAmt, rARM, 30) : null,
      highlight: false,
      badge:   "Lower initial rate",
      note:    "Rate adjusts after 7 years",
    });
  }

  return cards;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;
  const purpose = p.get("purpose") ?? "";
  const price   = p.get("price")   ?? "";
  const credit  = p.get("credit")  ?? "Unknown";
  const down    = p.get("down")    ?? "10%";

  const [base, isLive] = await fetchMNDRates()
    .then(d => [d, true] as const)
    .catch(() => [{ base30: 6.75, base15: 6.25, baseFHA: 6.50, baseARM: 6.00 }, false] as const);

  const cards = buildCards(base, credit, purpose, price, down);

  const body: RatesResponse = {
    cards,
    source:     isLive ? "live" : "fallback",
    as_of:      new Date().toISOString(),
    disclaimer: "Rates shown are indicative based on current market benchmarks. Actual rate depends on full loan application, credit review, and lender pricing. Not a commitment to lend.",
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
  });
}

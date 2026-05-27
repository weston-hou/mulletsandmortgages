/**
 * app/api/rates/quote/route.ts
 * POST /api/rates/quote
 *
 * Receives borrower details from the landing page form, fetches live rates
 * directly from the Optimal Blue QuickQuote API (no browser needed — it's
 * a plain REST endpoint), applies a 2-point buydown to the best rate in each
 * loan category, then emails the results via Resend.
 *
 * Field value maps are derived from:
 *   GET https://quickquote-consumer.optimalblue.com/api/search/getFormData/3833383237/34363030363031/33333431
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { buildRatesEmailHtml, RateCardData } from "@/lib/rates-email";

// ─── Constants ────────────────────────────────────────────────────────────────

const QQ_API   = "https://quickquote-consumer.optimalblue.com/api/search/GetResults";
const CLIENT_ID = "3833383237";
const USER_ID   = "34363030363031";
const FORM_ID   = "33333431";

const APPLY_URL =
  "https://prod.lendingpad.com/adaxa-home/pos#/?loid=c4d5c50b-bce5-4a80-8f65-2bac9bb4d12f";

// 2 pts applied: each discount point ≈ 0.25% rate reduction
const POINTS = 2;
const RATE_REDUCTION = POINTS * 0.25; // 0.50%

// ─── Field value maps (from getFormData) ─────────────────────────────────────

// Loan Purpose
const LOAN_PURPOSE_MAP: Record<string, string> = {
  "Purchase a home":         "106",
  "Refinance my current home": "112",
  "Cash-out refinance":      "111",
  "Investment property":     "106", // purchase, occupancy handled separately
  "Not sure yet":            "106",
};

// Occupancy
const OCCUPANCY_MAP: Record<string, string> = {
  "Purchase a home":         "2", // Primary Residence
  "Refinance my current home": "2",
  "Cash-out refinance":      "2",
  "Investment property":     "1", // Investment
  "Not sure yet":            "2",
};

// Property Type
const PROPERTY_TYPE_MAP: Record<string, string> = {
  "Single family home":          "115",
  "Townhouse / condo":           "119",
  "Multi-family (2–4 units)":    "102",
  "Manufactured home":           "120",
  "Investment property":         "115",
};

// State (only states available in this form's configured list)
const STATE_MAP: Record<string, string> = {
  "AZ": "57",
  "ID": "67",
  "MT": "81",
  "NV": "83",
  "OR": "92",
  "UT": "99",
  "WA": "102",
  "WY": "105",
};

// Credit Score — pick the highest band at or below the borrower's score
const CREDIT_SCORE_MAP: Record<string, string> = {
  "760+":      "780",
  "720 – 759": "760",
  "720–759":   "760",
  "680 – 719": "700",
  "680–719":   "700",
  "640 – 679": "660",
  "640–679":   "660",
  "600 – 639": "640",
  "600–639":   "640",
  "Below 600": "620",
  "Not sure":  "700",
};

// Military/Veteran
const VETERAN_MAP: Record<string, string> = {
  "Yes": "109",
  "No":  "110",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(s: string): number {
  return parseInt((s ?? "").replace(/[^0-9]/g, ""), 10) || 0;
}

function monthlyPayment(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || annualRate <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// ─── Rate picking logic ───────────────────────────────────────────────────────
// From each relevant group we pick the product with price closest to 100
// (par pricing — fewest points paid/received). Then apply 2-pt buydown.

interface QQProduct {
  productName: string;
  rate: number;
  price: number;       // e.g. 99.125 = -0.875 pts, 100 = par, 100.5 = 0.5 pt rebate
  monthlyPayments: number;
}

interface QQGroup {
  name: string;
  products: { $values: QQProduct[] };
}

function pickBestProduct(group: QQGroup): QQProduct | null {
  const products = group.products?.$values ?? [];
  if (products.length === 0) return null;
  // Prefer product where price is closest to 98 (slight buy-down already baked in from lender side)
  return products.reduce((best, p) =>
    Math.abs(p.price - 98) < Math.abs(best.price - 98) ? p : best
  );
}

function termFromGroupName(name: string): number {
  if (name.includes("15")) return 15;
  if (name.includes("20")) return 20;
  if (name.includes("40")) return 40;
  return 30;
}

// ─── Build rate cards from QQ results ────────────────────────────────────────

function buildCards(
  groups: QQGroup[],
  loanAmt: number,
  isVA: boolean,
): RateCardData[] {
  const cards: RateCardData[] = [];

  // Priority order: Conv 30 (or VA 30), Conv 15, FHA 30, Conv 7yr ARM
  const want = [
    { match: isVA ? "VA" : "Conforming 30 Yr Fixed",  badge: isVA ? "Best Match (VA)" : "Best Match", highlight: true,  note: undefined },
    { match: "Conforming 15 Yr Fixed",                  badge: "Build equity faster",                   highlight: false, note: undefined },
    { match: "FHA 30 Yr Fixed",                         badge: "Low down payment",                      highlight: false, note: "Includes mortgage insurance" },
    { match: "Conforming 7 Year ARM",                   badge: "Lower initial rate",                    highlight: false, note: "Rate adjusts after 7 years" },
  ];

  for (const w of want) {
    const group = groups.find(g => g.name.toLowerCase().includes(w.match.toLowerCase()));
    if (!group) continue;
    const product = pickBestProduct(group);
    if (!product) continue;

    const termYrs = termFromGroupName(group.name);
    const adjRate = Math.round((product.rate - RATE_REDUCTION) * 1000) / 1000;
    // APR estimate: rate + spread based on loan type
    const aprSpread = w.note?.includes("mortgage insurance") ? 0.35 : 0.12;
    const adjApr  = Math.round((adjRate + aprSpread) * 1000) / 1000;
    const payment = loanAmt > 0 ? monthlyPayment(loanAmt, adjRate, termYrs) : null;

    cards.push({
      badge:     w.badge,
      rate:      adjRate,
      apr:       adjApr,
      type:      group.name.replace(" Fixed ", "-yr Fixed ").replace(" Yr ", "-yr ").replace("Conforming ", "").replace("  ", " ").trim(),
      payment,
      note:      w.note,
      highlight: w.highlight,
    });
  }

  return cards;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      firstName    = "",
      lastName     = "",
      email        = "",
      purpose      = "Purchase a home",
      price:  priceStr  = "0",
      downPayment: downStr = "0",
      credit       = "760+",
      state        = "AZ",
      zip          = "",
      propertyType = "Single family home",
      veteranStatus = "No",
    } = body;

    if (!email || !firstName) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const price      = parseAmount(priceStr);
    const downPayment = parseAmount(downStr);
    const loanAmt    = Math.max(price - downPayment, 0);

    // Map form values to QQ API values
    const qqPayload = {
      clientId: CLIENT_ID,
      userId:   USER_ID,
      formId:   FORM_ID,
      inputs: {
        loanPurpose:       LOAN_PURPOSE_MAP[purpose]      ?? "106",
        occupancy:         OCCUPANCY_MAP[purpose]         ?? "2",
        propertyType:      PROPERTY_TYPE_MAP[propertyType] ?? "115",
        purchasePrice:     price,
        downPayment:       downPayment,
        loanAmount:        loanAmt,
        state:             STATE_MAP[state.toUpperCase()]  ?? STATE_MAP["AZ"],
        zipcode:           zip,
        creditScore:       CREDIT_SCORE_MAP[credit]       ?? "760",
        militaryOrVeteran: VETERAN_MAP[veteranStatus]     ?? "110",
      },
    };

    // Call the QuickQuote API
    const qqRes = await fetch(QQ_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qqPayload),
    });

    if (!qqRes.ok) {
      throw new Error(`QuickQuote API error: ${qqRes.status}`);
    }

    const qqData = await qqRes.json();
    const groups: QQGroup[] = qqData?.results?.$values ?? [];

    if (groups.length === 0) {
      throw new Error("QuickQuote returned no results");
    }

    // Build rate cards with 2-pt buydown
    const isVA = veteranStatus === "Yes";
    const cards = buildCards(groups, loanAmt, isVA);

    if (cards.length === 0) {
      throw new Error("Could not build rate cards from QuickQuote results");
    }

    // Build pre-qual URL pre-filled with their info
    // Pre-calculate requestedLoanAmount = price - downPayment so the form doesn't fail
    const requestedLoanAmount = String(loanAmt);
    const prequal_url = "https://mulletsandmortgages.com/apply?" + new URLSearchParams({
      firstName,
      lastName,
      email,
      loanPurpose:          purpose,
      estimatedPrice:       priceStr,
      creditScore:          credit,
      state,
      zip,
      propertyType,
      downPayment:          downStr,
      requestedLoanAmount,
    }).toString();

    // Build and send email
    const html = buildRatesEmailHtml({
      firstName,
      email,
      purpose,
      price:       price > 0 ? `$${price.toLocaleString()}` : "",
      downPayment: downPayment > 0 ? `$${downPayment.toLocaleString()}` : "",
      credit,
      zip,
      cards,
      prequal_url,
      apply_url: APPLY_URL,
    });

    await sendEmail({
      to: email,
      subject: `Hey ${firstName}, here are your rate options`,
      html,
      replyTo: "zach@mulletsandmortgages.com",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rates/quote] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

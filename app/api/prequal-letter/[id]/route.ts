/**
 * app/api/prequal-letter/[id]/route.ts
 * GET /api/prequal-letter/:id
 *
 * Returns a print-ready HTML pre-qualification letter for the given lead.
 * No external dependencies — pure HTML + inline CSS, works on Vercel Edge.
 *
 * Access:
 *   - X-Admin-Key header (admin use)
 *   - ?token=<lead.id> query param (public share link for the borrower)
 *
 * The prequal_letter_url stored on the lead is just this endpoint URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

function isAdmin(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!adminKey) return false;
  return req.headers.get("X-Admin-Key") === adminKey;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Phoenix",
  });
}

// Map price range string → numeric ceiling for the letter
function parsePriceRange(price?: string): { amount: string; label: string } {
  if (!price) return { amount: "", label: "" };
  const map: Record<string, { amount: string; label: string }> = {
    "Under $200k":    { amount: "$200,000",    label: "up to $200,000" },
    "$200k – $400k":  { amount: "$400,000",    label: "up to $400,000" },
    "$400k – $600k":  { amount: "$600,000",    label: "up to $600,000" },
    "$600k – $800k":  { amount: "$800,000",    label: "up to $800,000" },
    "$800k – $1M":    { amount: "$1,000,000",  label: "up to $1,000,000" },
    "Over $1M":       { amount: "$1,500,000",  label: "up to $1,500,000" },
  };
  return map[price] ?? { amount: price, label: price };
}

function renderLetter(lead: {
  first_name: string;
  last_name: string;
  prequal_full_name?: string;
  estimated_price?: string;
  loan_purpose?: string;
  prequal_zip?: string;
  prequal_completed_at?: string;
  created_at: string;
}): string {
  const borrowerName = lead.prequal_full_name ?? `${lead.first_name} ${lead.last_name}`;
  const { amount } = parsePriceRange(lead.estimated_price);
  const issueDate = formatDate(lead.prequal_completed_at ?? lead.created_at);
  const expiryDate = formatDate(
    new Date(new Date(lead.prequal_completed_at ?? lead.created_at).getTime() + 45 * 86400000).toISOString()
  );
  const loanPurpose = lead.loan_purpose ?? "purchase";
  const isPurchase = !loanPurpose.toLowerCase().includes("refi");
  const locationNote = lead.prequal_zip ? ` in the ${lead.prequal_zip} area` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pre-Qualification Letter — ${borrowerName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Georgia", "Times New Roman", serif;
      background: #f5f5f0;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 16px;
      color: #1a1a1a;
    }

    .page {
      background: #ffffff;
      width: 100%;
      max-width: 720px;
      padding: 64px 72px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.12);
      border-radius: 2px;
      position: relative;
    }

    /* Accent bar */
    .page::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, #f59e0b, #d97706);
      border-radius: 2px 2px 0 0;
    }

    /* Header */
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e5e5;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      font-size: 28px;
      line-height: 1;
    }

    .brand-text h1 {
      font-family: "Arial Black", "Arial", sans-serif;
      font-size: 18px;
      font-weight: 900;
      color: #1a1a1a;
      letter-spacing: -0.3px;
      line-height: 1.2;
    }

    .brand-text h1 span { color: #d97706; }

    .brand-text p {
      font-family: "Arial", sans-serif;
      font-size: 11px;
      color: #888;
      margin-top: 2px;
    }

    .header-meta {
      text-align: right;
      font-family: "Arial", sans-serif;
      font-size: 11px;
      color: #666;
      line-height: 1.7;
    }

    .header-meta strong {
      display: block;
      font-size: 12px;
      color: #1a1a1a;
      font-weight: 700;
    }

    /* Letter title */
    .letter-title {
      font-family: "Arial Black", "Arial", sans-serif;
      font-size: 22px;
      font-weight: 900;
      text-align: center;
      color: #1a1a1a;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .letter-subtitle {
      font-family: "Arial", sans-serif;
      font-size: 12px;
      text-align: center;
      color: #888;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 36px;
    }

    /* Date line */
    .date-line {
      font-family: "Arial", sans-serif;
      font-size: 13px;
      color: #555;
      margin-bottom: 24px;
    }

    /* Body */
    .body p {
      font-size: 14px;
      line-height: 1.85;
      color: #2a2a2a;
      margin-bottom: 16px;
    }

    .body p strong {
      color: #1a1a1a;
    }

    /* Highlight box */
    .highlight {
      background: #fffbeb;
      border: 1.5px solid #f59e0b;
      border-radius: 6px;
      padding: 20px 24px;
      margin: 28px 0;
      font-family: "Arial", sans-serif;
    }

    .highlight .hl-label {
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #d97706;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .highlight .hl-amount {
      font-size: 32px;
      font-weight: 900;
      color: #1a1a1a;
      line-height: 1;
      font-family: "Arial Black", "Arial", sans-serif;
    }

    .highlight .hl-sub {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }

    /* Disclaimer */
    .disclaimer {
      font-family: "Arial", sans-serif;
      font-size: 10.5px;
      color: #999;
      line-height: 1.6;
      border-top: 1px solid #e5e5e5;
      padding-top: 20px;
      margin-top: 36px;
    }

    /* Signature */
    .signature {
      margin-top: 36px;
      font-family: "Arial", sans-serif;
    }

    .signature .sig-label {
      font-size: 12px;
      color: #555;
      margin-bottom: 36px;
    }

    .signature .sig-name {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a1a;
      border-top: 1px solid #1a1a1a;
      padding-top: 8px;
      display: inline-block;
      min-width: 220px;
    }

    .signature .sig-title {
      font-size: 12px;
      color: #555;
      margin-top: 4px;
    }

    .signature .sig-nmls {
      font-size: 11px;
      color: #999;
      margin-top: 2px;
    }

    /* Print */
    @media print {
      body { background: white; padding: 0; }
      .page { box-shadow: none; padding: 48px 56px; }
      .page::before { display: none; }
      .print-btn { display: none; }
    }

    /* Print button (screen only) */
    .print-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #f59e0b;
      color: #000;
      font-family: "Arial Black", sans-serif;
      font-size: 13px;
      font-weight: 900;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(245,158,11,0.4);
    }

    .print-btn:hover { background: #d97706; }
  </style>
</head>
<body>
  <div class="page">

    <div class="header">
      <div class="brand">
        <div class="brand-icon">✂️</div>
        <div class="brand-text">
          <h1>Mullets <span>&</span> Mortgages</h1>
          <p>BrokerBoyko LLC · Equal Housing Lender</p>
        </div>
      </div>
      <div class="header-meta">
        <strong>Zachary Boyko</strong>
        Mortgage Broker<br />
        NMLS #2004025<br />
        BrokerBoyko LLC · NMLS #2380533<br />
        (602) 410-1334
      </div>
    </div>

    <div class="letter-title">Pre-Qualification Letter</div>
    <div class="letter-subtitle">Conditional Financing Pre-Qualification</div>

    <div class="date-line">Date: ${issueDate}</div>

    <div class="body">
      <p>To Whom It May Concern,</p>

      <p>
        This letter confirms that <strong>${borrowerName}</strong> has been
        pre-qualified for ${isPurchase ? "a home purchase" : "a refinance transaction"}
        ${locationNote} based on a preliminary review of their financial information.
      </p>

      ${amount ? `
      <div class="highlight">
        <div class="hl-label">Pre-Qualified Up To</div>
        <div class="hl-amount">${amount}</div>
        <div class="hl-sub">Subject to final underwriting approval</div>
      </div>
      ` : ""}

      <p>
        This pre-qualification is based on information provided by the applicant,
        including income, employment, assets, and credit profile. It is not a
        commitment to lend or a guarantee of financing. Final approval is subject
        to a complete underwriting review, satisfactory appraisal, and verification
        of all submitted information.
      </p>

      <p>
        The borrower has demonstrated a credit profile and financial scenario
        consistent with qualification for conventional and/or government-backed
        mortgage products. We look forward to assisting ${lead.first_name} in
        achieving their ${isPurchase ? "homeownership" : "refinancing"} goals.
      </p>

      <p>
        This letter is valid through <strong>${expiryDate}</strong> (45 days from
        issuance). For questions regarding this pre-qualification, please contact
        our office directly.
      </p>

      <p>Sincerely,</p>
    </div>

    <div class="signature">
      <div class="sig-label">Issued by:</div>
      <div class="sig-name">Zachary Boyko</div>
      <div class="sig-title">Mortgage Broker</div>
      <div class="sig-nmls">NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533</div>
    </div>

    <div class="disclaimer">
      This pre-qualification letter does not constitute a loan commitment or lock-in of any interest rate or program.
      All loan applications are subject to credit approval, satisfactory appraisal, title search, and compliance with
      all applicable laws and regulations. This letter is not an advertisement for credit as defined by Regulation Z.
      BrokerBoyko LLC is licensed in Arizona and other states. Equal Housing Lender.
    </div>

  </div>

  <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  // Auth: admin key OR token param matching the lead ID (public share link)
  const token = req.nextUrl.searchParams.get("token");
  const admin = isAdmin(req);

  if (!admin && token !== id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lead = await db.leads.getById(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!lead.prequal_complete) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#666">
        <h2>Pre-qualification not yet complete</h2>
        <p>This letter will be available once pre-qualification is finished.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const html = renderLetter(lead);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

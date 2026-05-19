/**
 * lib/documents.ts
 * Document generation for Mullets & Mortgages.
 *
 * Generates HTML documents for:
 *   - consent_to_contact   : TCPA/SMS consent acknowledgment
 *   - loan_disclosure      : Initial loan disclosure summary
 *   - prequal_letter       : Pre-qualification letter (mirrors the API route)
 *
 * When GOOGLE_SERVICE_ACCOUNT_JSON is set, documents are uploaded to Google
 * Drive and sent for eSignature via the Google Workspace eSignature API.
 * Without it, a self-hosted "click-to-sign" flow is used instead.
 */

export type DocumentType = "consent_to_contact" | "loan_disclosure" | "prequal_letter";

export interface DocumentRecipient {
  name: string;
  email: string;
  phone?: string;
}

export interface DocumentContext {
  leadId: string;
  recipient: DocumentRecipient;
  loanPurpose?: string;
  estimatedPrice?: string;
  creditScore?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  downPayment?: string;
  prequalLetterUrl?: string;
  prequalCompletedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Phoenix",
  });
}

function expiryDate(days: number): string {
  return new Date(Date.now() + days * 86400000).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Phoenix",
  });
}

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #f5f5f0; padding: 40px 16px; color: #1a1a1a; }
  .page { background: #fff; max-width: 720px; margin: 0 auto; padding: 64px 72px; box-shadow: 0 4px 32px rgba(0,0,0,.12); border-radius: 2px; position: relative; }
  .page::before { content:""; position:absolute; top:0; left:0; right:0; height:6px; background: linear-gradient(90deg,#f59e0b,#d97706); border-radius:2px 2px 0 0; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:36px; padding-bottom:20px; border-bottom:1px solid #e5e5e5; }
  .brand { display:flex; align-items:center; gap:10px; }
  .brand-icon { font-size:26px; }
  .brand h1 { font-size:17px; font-weight:900; color:#1a1a1a; }
  .brand h1 span { color:#d97706; }
  .brand p { font-size:11px; color:#888; margin-top:2px; }
  .meta { text-align:right; font-size:11px; color:#666; line-height:1.7; }
  .meta strong { display:block; font-size:12px; color:#1a1a1a; }
  h2 { font-size:20px; font-weight:900; text-align:center; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px; }
  .subtitle { font-size:11px; text-align:center; color:#888; letter-spacing:2px; text-transform:uppercase; margin-bottom:32px; }
  .date { font-size:13px; color:#555; margin-bottom:20px; }
  p { font-size:14px; line-height:1.85; color:#2a2a2a; margin-bottom:14px; }
  p strong { color:#1a1a1a; }
  .highlight { background:#fffbeb; border:1.5px solid #f59e0b; border-radius:6px; padding:18px 22px; margin:24px 0; }
  .highlight .label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#d97706; font-weight:700; margin-bottom:4px; }
  .highlight .value { font-size:24px; font-weight:900; color:#1a1a1a; }
  .section { margin-top:24px; }
  .section h3 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; margin-bottom:8px; border-bottom:1px solid #e5e5e5; padding-bottom:6px; }
  .sig-block { margin-top:40px; }
  .sig-line { display:inline-block; min-width:260px; border-top:1px solid #1a1a1a; padding-top:6px; font-size:14px; font-weight:700; }
  .sig-sub { font-size:11px; color:#555; margin-top:3px; }
  .disclaimer { font-size:10.5px; color:#999; line-height:1.6; border-top:1px solid #e5e5e5; padding-top:18px; margin-top:32px; }
  /* Sign box */
  .sign-box { margin-top:36px; border:2px dashed #f59e0b; border-radius:8px; padding:24px; text-align:center; }
  .sign-box p { color:#555; font-size:13px; margin-bottom:12px; }
  .sign-btn { display:inline-block; background:#f59e0b; color:#000; font-weight:900; font-size:14px; text-decoration:none; padding:12px 32px; border-radius:8px; }
  @media print { body{background:#fff;padding:0} .page{box-shadow:none;padding:48px 56px} .page::before{display:none} .sign-box{display:none} .print-btn{display:none} }
  .print-btn { position:fixed; bottom:24px; right:24px; background:#f59e0b; color:#000; font-weight:900; font-size:13px; padding:12px 24px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 16px rgba(245,158,11,.4); }
`;

function header(): string {
  return `
  <div class="header">
    <div class="brand">
      <div class="brand-icon">✂️</div>
      <div>
        <h1>Mullets <span>&</span> Mortgages</h1>
        <p>BrokerBoyko LLC · Equal Housing Lender</p>
      </div>
    </div>
    <div class="meta">
      <strong>Zachary Boyko</strong>
      Mortgage Broker<br/>
      NMLS #2004025<br/>
      BrokerBoyko LLC · NMLS #2380533<br/>
      (602) 410-1334
    </div>
  </div>`;
}

function signBox(signUrl: string, label = "Sign & Acknowledge"): string {
  return `
  <div class="sign-box">
    <p>Please review the above and click the button below to sign electronically.</p>
    <a href="${signUrl}" class="sign-btn">✍️ ${label} →</a>
    <p style="margin-top:10px;font-size:11px;color:#aaa;">
      By clicking you agree this constitutes your electronic signature.
    </p>
  </div>`;
}

// ─── Document renderers ───────────────────────────────────────────────────────

export function renderConsentToContact(ctx: DocumentContext, signUrl?: string): string {
  const { recipient, loanPurpose, estimatedPrice } = ctx;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <title>Consent to Contact — ${recipient.name}</title>
  <style>${BASE_STYLES}</style></head><body>
  <div class="page">
    ${header()}
    <h2>Consent to Contact</h2>
    <div class="subtitle">TCPA Disclosure & Authorization</div>
    <div class="date">Date: ${today()}</div>

    <p>This Consent to Contact Agreement ("Agreement") is entered into between <strong>${recipient.name}</strong>
    ("Borrower") and BrokerBoyko LLC, operating as Mullets & Mortgages ("Broker").</p>

    <div class="section">
      <h3>Authorization</h3>
      <p>By signing below, Borrower expressly authorizes Broker and its representatives to contact
      Borrower using automated or pre-recorded calls, text messages (SMS), and emails at the phone
      number(s) and email address(es) provided, for the purpose of discussing mortgage loan products
      and services${loanPurpose ? `, including a ${loanPurpose}` : ""}${estimatedPrice ? ` for approximately ${estimatedPrice}` : ""}.</p>
    </div>

    <div class="section">
      <h3>Scope of Consent</h3>
      <p>This consent covers communications related to: mortgage pre-qualification, loan options,
      rate quotes, application status updates, document requests, and general loan-related inquiries.
      Message frequency varies. Standard message and data rates may apply.</p>
    </div>

    <div class="section">
      <h3>Right to Opt Out</h3>
      <p>Borrower may revoke this consent at any time by replying <strong>STOP</strong> to any SMS
      message, clicking unsubscribe in any email, or contacting Broker directly at
      <strong>zach@mulletsandmortgages.com</strong> or <strong>(602) 410-1334</strong>. Revoking
      consent does not affect any prior communications.</p>
    </div>

    <div class="section">
      <h3>No Purchase Required</h3>
      <p>Consent to receive communications is not a condition of obtaining a loan or any other
      purchase. Borrower is under no obligation to proceed with any loan product.</p>
    </div>

    ${signUrl ? signBox(signUrl, "I Agree & Consent") : `
    <div class="sig-block">
      <p>Borrower Signature:</p>
      <div class="sig-line">${recipient.name}</div>
      <div class="sig-sub">Printed Name</div>
      <div class="sig-line" style="margin-top:24px;">&nbsp;</div>
      <div class="sig-sub">Signature &amp; Date</div>
    </div>`}

    <div class="disclaimer">
      This document is provided in compliance with the Telephone Consumer Protection Act (TCPA), 47 U.S.C. § 227,
      and applicable FCC regulations. BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender.
    </div>
  </div>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
  </body></html>`;
}

export function renderLoanDisclosure(ctx: DocumentContext, signUrl?: string): string {
  const { recipient, loanPurpose, estimatedPrice, creditScore, state, zip, propertyType, downPayment } = ctx;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <title>Loan Disclosure — ${recipient.name}</title>
  <style>${BASE_STYLES}</style></head><body>
  <div class="page">
    ${header()}
    <h2>Initial Loan Disclosure</h2>
    <div class="subtitle">Mortgage Broker Fee &amp; Services Disclosure</div>
    <div class="date">Date: ${today()}</div>

    <p>This disclosure is provided to <strong>${recipient.name}</strong> ("Borrower") by BrokerBoyko LLC,
    operating as Mullets & Mortgages, in accordance with applicable state and federal mortgage lending laws.</p>

    <div class="section">
      <h3>Loan Scenario</h3>
      ${estimatedPrice ? `<p><strong>Estimated Loan/Purchase Price:</strong> ${estimatedPrice}</p>` : ""}
      ${loanPurpose ? `<p><strong>Loan Purpose:</strong> ${loanPurpose}</p>` : ""}
      ${propertyType ? `<p><strong>Property Type:</strong> ${propertyType}</p>` : ""}
      ${(state || zip) ? `<p><strong>Property Location:</strong> ${[state, zip].filter(Boolean).join(" ")}</p>` : ""}
      ${downPayment ? `<p><strong>Down Payment:</strong> ${downPayment}</p>` : ""}
      ${creditScore ? `<p><strong>Self-Reported Credit Score:</strong> ${creditScore}</p>` : ""}
    </div>

    <div class="section">
      <h3>Broker Relationship</h3>
      <p>BrokerBoyko LLC acts as a mortgage broker and does not make loans directly. We shop your
      loan scenario across our network of 150+ wholesale lenders to find competitive rates and terms
      on your behalf. We are compensated by the lender when your loan closes (lender-paid compensation).
      No upfront fees are charged to the Borrower for our brokerage services.</p>
    </div>

    <div class="section">
      <h3>No Guarantee of Financing</h3>
      <p>This disclosure does not constitute a loan commitment, rate lock, or guarantee of financing.
      Final loan approval is subject to completed application, credit approval, satisfactory appraisal,
      and full underwriting review. Rates and programs are subject to change without notice.</p>
    </div>

    <div class="section">
      <h3>Credit Pull Authorization</h3>
      <p>A formal loan application will require a hard credit inquiry. No hard pull has been performed
      at this stage. By proceeding with a full application, Borrower authorizes BrokerBoyko LLC and
      its lending partners to obtain a tri-merge credit report.</p>
    </div>

    ${signUrl ? signBox(signUrl, "I Acknowledge Receipt") : `
    <div class="sig-block">
      <p>Borrower acknowledges receipt of this disclosure:</p>
      <div class="sig-line">${recipient.name}</div>
      <div class="sig-sub">Printed Name</div>
      <div class="sig-line" style="margin-top:24px;">&nbsp;</div>
      <div class="sig-sub">Signature &amp; Date</div>
    </div>`}

    <div class="disclaimer">
      BrokerBoyko LLC · NMLS #2380533 · Zachary Boyko · NMLS #2004025 · Equal Housing Lender.
      This disclosure is provided for informational purposes and does not constitute legal or financial advice.
      Valid through ${expiryDate(30)}.
    </div>
  </div>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
  </body></html>`;
}

export function renderDocument(type: DocumentType, ctx: DocumentContext, signUrl?: string): string {
  switch (type) {
    case "consent_to_contact": return renderConsentToContact(ctx, signUrl);
    case "loan_disclosure":    return renderLoanDisclosure(ctx, signUrl);
    default: throw new Error(`Unknown document type: ${type}`);
  }
}

/**
 * app/api/documents/request/route.ts
 * POST /api/documents/request
 *
 * Creates a document signature request for a lead.
 * Admin-only. Body:
 *   { lead_id, type: "consent_to_contact" | "loan_disclosure" }
 *
 * Flow:
 *   1. Fetch lead from Supabase
 *   2. Generate a signed token (lead_id + type + expiry) → sign URL
 *   3. Render HTML document with the sign URL embedded
 *   4. Store the pending request in document_requests table
 *   5. Email the document to the lead
 *   6. Log to conversations
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { renderDocument, type DocumentType, type DocumentContext } from "@/lib/documents";
import { sendEmail } from "@/lib/email";
import { createHmac } from "crypto";

function isAdmin(req: NextRequest): boolean {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return false;
  return req.headers.get("X-Admin-Key") === key;
}

// ─── Signed token ──────────────────────────────────────────────────────────────
// Token = base64url( JSON { lead_id, type, exp } ) + "." + HMAC-SHA256 sig
// Verified in /api/documents/sign

function signToken(leadId: string, docType: string, expiryMs: number): string {
  const secret = process.env.DOCUMENT_SIGNING_SECRET ?? process.env.ADMIN_PASSWORD ?? "dev-secret";
  const payload = Buffer.from(JSON.stringify({ lead_id: leadId, type: docType, exp: expiryMs }))
    .toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function buildSignUrl(leadId: string, docType: string, baseUrl: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const token = signToken(leadId, docType, exp);
  return `${baseUrl}/api/documents/sign?token=${token}`;
}

// ─── Email builder ────────────────────────────────────────────────────────────

const DOC_LABELS: Record<DocumentType, { subject: string; action: string }> = {
  consent_to_contact: {
    subject: "Action Required: Please Sign Your Consent Form",
    action: "sign your consent to contact form",
  },
  loan_disclosure: {
    subject: "Action Required: Please Acknowledge Your Loan Disclosure",
    action: "acknowledge your initial loan disclosure",
  },
  prequal_letter: {
    subject: "Your Pre-Qualification Letter",
    action: "view your pre-qualification letter",
  },
};

function buildDocEmailHtml(
  firstName: string,
  docType: DocumentType,
  signUrl: string
): string {
  const { action } = DOC_LABELS[docType];
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);}
  .accent{height:6px;background:linear-gradient(90deg,#f59e0b,#d97706);}
  .body{padding:40px 48px;}
  .logo{font-size:20px;font-weight:900;color:#1a1a1a;margin-bottom:28px;}
  .logo span{color:#d97706;}
  h1{font-size:22px;font-weight:900;color:#1a1a1a;margin:0 0 10px;}
  p{font-size:15px;line-height:1.7;color:#444;margin:0 0 14px;}
  .cta{display:inline-block;background:#f59e0b;color:#000;font-weight:900;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;margin:8px 0 20px;}
  .footer{padding:20px 48px;background:#f9f9f7;border-top:1px solid #e5e5e5;}
  .footer p{font-size:11px;color:#999;line-height:1.6;margin:0;}
</style></head><body>
<div class="wrap">
  <div class="accent"></div>
  <div class="body">
    <div class="logo">✂️ Mullets <span>&</span> Mortgages</div>
    <h1>Hi ${firstName}, one quick step</h1>
    <p>Zach needs you to ${action} before we can move forward with your loan scenario. It only takes a moment.</p>
    <a href="${signUrl}" class="cta">✍️ Review &amp; Sign →</a>
    <p style="font-size:13px;color:#888;">This link is valid for 30 days. If you have any questions, reply to this email or call Zach at <a href="tel:6024101334" style="color:#d97706;">(602) 410-1334</a>.</p>
  </div>
  <div class="footer">
    <p>Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender<br/>
    <a href="https://mulletsandmortgages.com" style="color:#d97706;">mulletsandmortgages.com</a></p>
  </div>
</div>
</body></html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { lead_id, type } = await req.json() as { lead_id?: string; type?: DocumentType };

    if (!lead_id || !type) {
      return NextResponse.json({ error: "lead_id and type required" }, { status: 400 });
    }

    const validTypes: DocumentType[] = ["consent_to_contact", "loan_disclosure"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Use: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const lead = await db.leads.getById(lead_id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.email) {
      return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mulletsandmortgages.com";
    const signUrl = buildSignUrl(lead_id, type, baseUrl);

    // Build document context
    const ctx: DocumentContext = {
      leadId: lead_id,
      recipient: {
        name: lead.prequal_full_name ?? `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        phone: lead.phone ?? undefined,
      },
      loanPurpose: lead.loan_purpose,
      estimatedPrice: lead.estimated_price,
      creditScore: lead.credit_score,
      state: lead.state,
      zip: lead.zip,
      propertyType: lead.property_type,
      downPayment: lead.down_payment,
    };

    // Render document HTML (with sign button)
    const docHtml = renderDocument(type, ctx, signUrl);

    // Build and send email
    const { subject } = DOC_LABELS[type];
    const emailHtml = buildDocEmailHtml(lead.first_name, type, signUrl);

    await sendEmail({ to: lead.email, subject, html: emailHtml });

    // Log to conversations
    await db.conversations.insert({
      lead_id,
      channel: "email",
      direction: "outbound",
      body: `Document sent: ${type.replace(/_/g, " ")} — awaiting signature`,
      ai_generated: false,
      metadata: { type: "document_request", doc_type: type, sign_url: signUrl },
    });

    return NextResponse.json({
      ok: true,
      sign_url: signUrl,
      doc_type: type,
      emailed_to: lead.email,
      // Also return the doc HTML so admin can preview inline
      preview_url: `${baseUrl}/api/documents/view?token=${signUrl.split("token=")[1]}`,
    });
  } catch (err) {
    console.error("[POST /api/documents/request]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

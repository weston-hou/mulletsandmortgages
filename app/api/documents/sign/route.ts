/**
 * app/api/documents/sign/route.ts
 *
 * GET  /api/documents/sign?token=...  — render document for review + signing
 * POST /api/documents/sign?token=...  — record the signature
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { renderDocument, type DocumentType, type DocumentContext } from "@/lib/documents";
import { sendEmail } from "@/lib/email";
import { createHmac } from "crypto";

// ─── Token verification ───────────────────────────────────────────────────────

interface TokenPayload { lead_id: string; type: DocumentType; exp: number }

function verifyToken(token: string): TokenPayload | null {
  try {
    const secret = process.env.DOCUMENT_SIGNING_SECRET ?? process.env.ADMIN_PASSWORD ?? "dev-secret";
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (expected !== sig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenPayload;
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── GET — render document ────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const payload = verifyToken(token);
  if (!payload) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#666">
        <h2>Link expired or invalid</h2>
        <p>This signing link is no longer valid. Please contact Zach at
        <a href="tel:6024101334">(602) 410-1334</a> for a new link.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  const lead = await db.leads.getById(payload.lead_id);
  if (!lead) return new NextResponse("Lead not found", { status: 404 });

  // Check if already signed
  const leadRecord = lead as unknown as Record<string, unknown>;
  const alreadySigned = leadRecord[`${payload.type}_signed_at`];
  if (alreadySigned) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#1a1a1a">
        <div style="max-width:500px;margin:0 auto;text-align:center;padding-top:60px">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="font-size:22px;margin-bottom:8px">Already signed</h2>
          <p style="color:#666">This document was signed on ${new Date(alreadySigned as string).toLocaleDateString()}.</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const ctx: DocumentContext = {
    leadId: lead.id,
    recipient: {
      name: lead.prequal_full_name ?? `${lead.first_name} ${lead.last_name}`,
      email: lead.email ?? "",
      phone: lead.phone,
    },
    loanPurpose: lead.loan_purpose,
    estimatedPrice: lead.estimated_price,
    creditScore: lead.credit_score,
    state: lead.state,
    zip: lead.zip,
    propertyType: lead.property_type,
    downPayment: lead.down_payment,
  };

  // Sign URL points to POST on same endpoint
  const postUrl = `${req.nextUrl.origin}/api/documents/sign?token=${token}`;

  // Render with a proper form-based sign button (POST on submit)
  const baseHtml = renderDocument(payload.type, ctx);

  // Inject a POST form in place of the sign box
  const signForm = `
  <div class="sign-box" style="margin-top:36px;border:2px dashed #f59e0b;border-radius:8px;padding:24px;text-align:center;">
    <p style="color:#555;font-size:14px;margin-bottom:16px;">
      By clicking below, you confirm you have read this document and agree to sign electronically.
    </p>
    <form method="POST" action="${postUrl}">
      <button type="submit" style="background:#f59e0b;color:#000;font-weight:900;font-size:15px;padding:14px 32px;border:none;border-radius:8px;cursor:pointer;">
        ✍️ Sign & Submit →
      </button>
    </form>
    <p style="margin-top:10px;font-size:11px;color:#aaa;">
      Your electronic signature is legally binding under the E-SIGN Act (15 U.S.C. § 7001).
    </p>
  </div>`;

  // Insert form before closing </div> of .page
  const html = baseHtml.replace(
    /<div class="sign-box"[\s\S]*?<\/div>\s*(?=<div class="disclaimer"|<\/div>)/,
    signForm
  );

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ─── POST — record signature ──────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const payload = verifyToken(token);
  if (!payload) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;">
        <h2>Link expired</h2><p>Please contact Zach for a new link.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  const lead = await db.leads.getById(payload.lead_id);
  if (!lead) return new NextResponse("Lead not found", { status: 404 });

  const signedAt = new Date().toISOString();
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  // Stamp signature on lead record
  const fieldKey = `${payload.type}_signed_at` as "consent_to_contact_signed_at" | "loan_disclosure_signed_at";
  await db.leads.update(payload.lead_id, {
    [fieldKey]: signedAt,
    [`${payload.type}_sign_ip`]: ip,
  } as Parameters<typeof db.leads.update>[1]);

  // Log to conversations
  await db.conversations.insert({
    lead_id: payload.lead_id,
    channel: "email",
    direction: "inbound",
    body: `✍️ Document signed: ${payload.type.replace(/_/g, " ")}`,
    ai_generated: false,
    metadata: {
      type: "document_signed",
      doc_type: payload.type,
      signed_at: signedAt,
      ip,
      user_agent: userAgent,
    },
  });

  // Notify Zach
  const zachPhone = process.env.ZACH_PHONE;
  if (zachPhone) {
    try {
      const { default: notifyFn } = await import("@/lib/notify-zach");
      await notifyFn(
        `✍️ ${lead.first_name} ${lead.last_name} signed: ${payload.type.replace(/_/g, " ")}\n` +
        `Admin: https://mulletsandmortgages.com/admin/leads/${lead.id}`
      );
    } catch { /* non-fatal */ }
  }

  // Email confirmation to borrower
  if (lead.email) {
    try {
      await sendEmail({
        to: lead.email,
        subject: "Signature received — thank you!",
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
  <div style="height:6px;background:linear-gradient(90deg,#f59e0b,#d97706);"></div>
  <div style="padding:40px 48px;">
    <div style="font-size:20px;font-weight:900;margin-bottom:24px;">✂️ Mullets <span style="color:#d97706;">&</span> Mortgages</div>
    <div style="font-size:40px;text-align:center;margin-bottom:16px;">✅</div>
    <h1 style="font-size:22px;font-weight:900;text-align:center;margin:0 0 12px;">Signature received!</h1>
    <p style="font-size:15px;line-height:1.7;color:#444;text-align:center;">
      Thanks, ${lead.first_name}. We've recorded your signature on the
      <strong>${payload.type.replace(/_/g, " ")}</strong>. Zach will be in touch shortly.
    </p>
    <p style="font-size:13px;color:#888;text-align:center;margin-top:16px;">
      Questions? Call Zach at <a href="tel:6024101334" style="color:#d97706;">(602) 410-1334</a>
    </p>
  </div>
  <div style="padding:20px 48px;background:#f9f9f7;border-top:1px solid #e5e5e5;">
    <p style="font-size:11px;color:#999;margin:0;">Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender</p>
  </div>
</div></body></html>`,
      });
    } catch { /* non-fatal */ }
  }

  // Return success page
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Signed!</title>
    <style>
      body{margin:0;padding:0;background:#0f0f0f;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
      .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:48px 40px;max-width:440px;text-align:center;}
      .icon{font-size:56px;margin-bottom:20px;}
      h1{color:#fff;font-size:24px;font-weight:900;margin:0 0 10px;}
      p{color:#888;font-size:15px;line-height:1.6;margin:0 0 24px;}
      .badge{display:inline-flex;align-items:center;gap:6px;background:#16a34a22;border:1px solid #16a34a44;color:#4ade80;font-size:13px;padding:8px 16px;border-radius:999px;}
    </style>
    </head><body>
    <div class="card">
      <div class="icon">✅</div>
      <h1>You're all set, ${lead.first_name}!</h1>
      <p>Your signature has been recorded. A confirmation has been sent to your email. Zach will be in touch shortly.</p>
      <div class="badge"><span>●</span> Signed ${new Date(signedAt).toLocaleDateString()}</div>
    </div>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

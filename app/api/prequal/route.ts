/**
 * app/api/prequal/route.ts
 * POST /api/prequal
 *
 * Runs the DTI engine, generates the pre-qual letter, stores the result,
 * and emails it to the lead — all automatically.
 *
 * Called from:
 *   - /apply page after step 3 submit (with full income/debt data)
 *   - Admin panel manually for any lead
 *
 * Body:
 *   {
 *     lead_id: string,
 *     grossMonthlyIncome: number,
 *     carLoan: number,
 *     studentLoan: number,
 *     currentMortgage: number,
 *     otherDebt: number,
 *     requestedLoanAmount: number,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { runPrequalEngine, formatCurrency, monthlyPayment } from "@/lib/prequal-engine";
import { renderPrequalLetter } from "@/lib/documents";
import { sendEmail, buildPrequalEmailHtml } from "@/lib/email";

function issuedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Phoenix",
  });
}

function expiryDateStr(days = 45): string {
  return new Date(Date.now() + days * 86400000).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Phoenix",
  });
}

function creditScoreToNumber(raw?: string | null): number {
  if (!raw) return 0;
  const match = raw.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      lead_id,
      grossMonthlyIncome,
      carLoan       = 0,
      studentLoan   = 0,
      currentMortgage = 0,
      otherDebt     = 0,
      requestedLoanAmount,
    } = body;

    if (!lead_id) {
      return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    }

    // Load lead
    const lead = await db.leads.getById(lead_id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const creditScore = creditScoreToNumber(lead.prequal_credit_score ?? lead.credit_score);

    // ── Run DTI engine ────────────────────────────────────────────────────────
    const result = runPrequalEngine({
      grossMonthlyIncome,
      debts: { carLoan, studentLoan, currentMortgage, otherDebt },
      requestedLoanAmount,
      creditScore,
      loanPurpose: lead.loan_purpose ?? "Purchase a home",
      state: lead.state ?? "AZ",
    });

    // ── Save prequal fields to lead ───────────────────────────────────────────
    await db.leads.update(lead.id, {
      prequal_income:       String(grossMonthlyIncome),
      prequal_liabilities:  String(carLoan + studentLoan + currentMortgage + otherDebt),
      prequal_credit_score: lead.prequal_credit_score ?? lead.credit_score ?? undefined,
      prequal_zip:          lead.prequal_zip ?? lead.zip ?? undefined,
    });

    // ── Declined path ─────────────────────────────────────────────────────────
    if (!result.approved && result.approvedLoanAmount === 0) {
      // Notify Zach + send empathetic decline email
      if (lead.email) {
        await sendEmail({
          to: lead.email,
          subject: `Your pre-qualification — ${lead.first_name}`,
          html: buildDeclineEmailHtml({
            firstName: lead.first_name,
            reason: result.declineReason ?? "The numbers didn't quite work out.",
          }),
        });
      }

      return NextResponse.json({
        approved: false,
        declineReason: result.declineReason,
        qualifiedAmount: 0,
      });
    }

    // ── Partial approval (requested > qualified) ──────────────────────────────
    // Still generate the letter for what they DO qualify for

    // ── Generate letter HTML ──────────────────────────────────────────────────
    const letterHtml = renderPrequalLetter({
      leadId: lead.id,
      recipient: {
        name: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
        email: lead.email ?? "",
        phone: lead.phone ?? undefined,
      },
      loanPurpose: lead.loan_purpose ?? "Purchase a home",
      approvedLoanAmount: result.approvedLoanAmount,
      assumedMonthlyPayment: result.assumedMonthlyPayment,
      stressRatePct: result.stressRatePct,
      maxMonthlyPayment: result.maxMonthlyPayment,
      state: lead.state ?? "AZ",
      propertyType: lead.property_type ?? undefined,
      issuedDate: issuedDate(),
      expiryDate: expiryDateStr(45),
    });

    // ── Store letter as a hosted URL via /api/prequal/letter/[id] ─────────────
    // For now store the HTML in Supabase and serve it via a dedicated route
    const letterUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://mulletsandmortgages.com"}/prequal/letter/${lead.id}`;

    await db.leads.update(lead.id, {
      prequal_complete:     true,
      prequal_completed_at: new Date().toISOString(),
      prequal_letter_url:   letterUrl,
      stage:                "pre_qual" as const,
    });

    // Store letter HTML in conversations table for retrieval
    await db.conversations.insert({
      lead_id: lead.id,
      channel:   "email",
      direction: "outbound",
      body:      letterHtml,
      ai_generated: false,
      metadata: { type: "prequal_letter", letter_url: letterUrl },
    });

    // ── Email the letter ──────────────────────────────────────────────────────
    if (lead.email) {
      const wasApprovedFull = result.approved;
      const emailHtml = buildPrequalEmailHtml({
        firstName:  lead.first_name,
        lastName:   lead.last_name ?? "",
        email:      lead.email,
        letterUrl,
        priceRange: formatCurrency(result.approvedLoanAmount),
        expiryDays: 45,
        wasPartial: !wasApprovedFull,
        requestedAmount:  wasApprovedFull ? undefined : formatCurrency(result.requestedLoanAmount),
        qualifiedAmount:  wasApprovedFull ? undefined : formatCurrency(result.approvedLoanAmount),
        shortfallAmount:  wasApprovedFull ? undefined : formatCurrency(result.shortfallAmount ?? 0),
      });

      await sendEmail({
        to: lead.email,
        subject: wasApprovedFull
          ? `Your pre-qualification letter is ready, ${lead.first_name}!`
          : `Your pre-qualification — ${lead.first_name}`,
        html: emailHtml,
      });
    }

    return NextResponse.json({
      approved: true,
      fullyApproved: result.approved,
      approvedLoanAmount: result.approvedLoanAmount,
      requestedLoanAmount: result.requestedLoanAmount,
      assumedMonthlyPayment: result.assumedMonthlyPayment,
      stressRatePct: result.stressRatePct,
      maxMonthlyPayment: result.maxMonthlyPayment,
      dtiUsed: result.dtiUsed,
      letterUrl,
      shortfallAmount: result.shortfallAmount,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/prequal]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Decline email ────────────────────────────────────────────────────────────

function buildDeclineEmailHtml({ firstName, reason }: { firstName: string; reason: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin: 0; padding: 0; background: #f5f5f0; font-family: Arial, sans-serif; }
    .wrapper { max-width: 580px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.07); }
    .accent { height: 5px; background: linear-gradient(90deg, #f59e0b, #d97706); }
    .body { padding: 36px 44px; }
    .logo { font-size: 18px; font-weight: 900; color: #1a1a1a; margin-bottom: 28px; }
    .logo span { color: #d97706; }
    p { font-size: 15px; line-height: 1.75; color: #333; margin: 0 0 16px; }
    a { color: #d97706; }
    .footer { padding: 20px 44px; background: #f9f9f7; border-top: 1px solid #eee; font-size: 11px; color: #bbb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="accent"></div>
    <div class="body">
      <div class="logo">✂️ Mullets <span>&</span> Mortgages</div>
      <p>Hi ${firstName},</p>
      <p>Thanks for going through the pre-qual process. Unfortunately, based on the numbers you provided, we weren't able to issue a pre-qualification at this time.</p>
      <p>${reason}</p>
      <p>That doesn't mean homeownership is off the table — it just means we need to look at your full picture together. Reply to this email, text, or call me at <a href="tel:6024101334">(602) 410-1334</a> and I'll walk you through options to get you there.</p>
      <p>— Zach</p>
    </div>
    <div class="footer">Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender</div>
  </div>
</body>
</html>`;
}

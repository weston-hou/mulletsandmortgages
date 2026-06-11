/**
 * app/api/leads/route.ts
 *
 * POST  /api/leads  — create a new lead from landing page form
 * GET   /api/leads  — paginated list (requires X-Admin-Key header)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// ─── POST: Create lead ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      // Contact
      firstName,
      lastName,
      email,
      phone,
      // Loan scenario
      loanPurpose,
      estimatedPrice,
      creditScore,
      state,
      zip,
      propertyType,
      downPayment,
      // UTM / tracking (from getTrackingContext())
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      clicked_at,
      landed_at,
      referrer,
      posthog_id,
      preferredContact,
    } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "first_name, last_name, and email are required" },
        { status: 400 }
      );
    }

    const lead = await db.leads.insert({
      first_name: firstName,
      last_name: lastName,
      email: email || undefined,
      phone: phone || null,
      loan_purpose: loanPurpose || undefined,
      estimated_price: estimatedPrice || undefined,
      credit_score: creditScore || undefined,
      state: state || undefined,
      zip: zip || undefined,
      property_type: propertyType || undefined,
      down_payment: downPayment || undefined,
      stage: "new",
      utm_source: utm_source || undefined,
      utm_medium: utm_medium || undefined,
      utm_campaign: utm_campaign || undefined,
      utm_content: utm_content || undefined,
      clicked_at: clicked_at ? Number(clicked_at) : undefined,
      landed_at: landed_at ? Number(landed_at) : undefined,
      referrer: referrer || undefined,
      posthog_id: posthog_id || undefined,
      preferred_contact: preferredContact ?? "email",
    });

    // Trigger the right agent based on preferred contact method
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mulletsandmortgages.com";
    const internalKey = process.env.CRON_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
    const agentHeaders = {
      "Content-Type": "application/json",
      "X-Admin-Key": internalKey,
    };

    const pref = preferredContact ?? "email";

    if (pref === "sms" || pref === "voice") {
      // SMS agent — schedules outreach via Twilio
      fetch(`${baseUrl}/api/agent/sms`, {
        method: "POST",
        headers: agentHeaders,
        body: JSON.stringify({ action: "trigger", lead_id: lead.id }),
      }).catch(err => console.error("[POST /api/leads] SMS trigger failed:", err));
    }

    return NextResponse.json({ id: lead.id, success: true }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }
}

// ─── GET: Paginated list (admin only) ────────────────────────────────────────

function isAdmin(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!adminKey) return false;
  const provided = req.headers.get("X-Admin-Key");
  return provided === adminKey;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const offset = (page - 1) * limit;
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const sort = searchParams.get("sort") ?? "created_at";
  const order = searchParams.get("order") ?? "desc";

  const params: Record<string, string> = {
    select: "*",
    order: `${sort}.${order}`,
    limit: String(limit),
    offset: String(offset),
  };
  if (stage) params.stage = `eq.${stage}`;
  if (source) params.utm_source = `eq.${source}`;

  try {
    const leads = await db.leads.list(params);
    return NextResponse.json({ leads, page, limit });
  } catch (err) {
    console.error("[GET /api/leads]", err);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

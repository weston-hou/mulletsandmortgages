/**
 * app/api/leads/[id]/route.ts
 *
 * GET   /api/leads/:id  — single lead with conversation history (admin only)
 * PATCH /api/leads/:id  — update stage, zach_notes, prequal fields (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

function isAdmin(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!adminKey) return false;
  return req.headers.get("X-Admin-Key") === adminKey;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [lead, conversations] = await Promise.all([
      db.leads.getById(id),
      db.conversations.forLead(id),
    ]);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead, conversations });
  } catch (err) {
    console.error("[GET /api/leads/:id]", err);
    return NextResponse.json(
      { error: "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();

    // Allowlist of patchable fields
    const allowed = [
      "stage",
      "zach_notes",
      "prequal_zip",
      "prequal_employment",
      "prequal_income",
      "prequal_liabilities",
      "prequal_credit_score",
      "prequal_full_name",
      "prequal_complete",
      "prequal_letter_url",
      "next_followup_at",
      "agent_notes",
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    // If marking prequal complete, stamp the timestamp
    if (patch.prequal_complete === true && !patch.prequal_completed_at) {
      patch.prequal_completed_at = new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No patchable fields provided" },
        { status: 400 }
      );
    }

    const lead = await db.leads.update(id, patch);
    return NextResponse.json({ lead });
  } catch (err) {
    console.error("[PATCH /api/leads/:id]", err);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

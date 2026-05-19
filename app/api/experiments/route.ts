/**
 * app/api/experiments/route.ts
 *
 * GET  /api/experiments        — list all experiments + results
 * POST /api/experiments        — create a new experiment
 * PATCH /api/experiments?id=.. — update (activate/deactivate/edit)
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

function isAdmin(req: NextRequest): boolean {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return false;
  return req.headers.get("X-Admin-Key") === key;
}

// ─── Results aggregation ──────────────────────────────────────────────────────
// For each experiment, count leads by variant and compute conversion rates.

async function getResults(experimentId: string) {
  // Fetch leads assigned to this experiment
  const { getConfig } = await import("@/lib/supabase") as { getConfig: () => { url: string; key: string } };
  const { url, key } = getConfig();

  const res = await fetch(
    `${url}/rest/v1/leads?experiment_id=eq.${experimentId}&select=variant,prequal_complete,stage`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );

  if (!res.ok) return { a: null, b: null };

  const leads = await res.json() as Array<{
    variant: "a" | "b";
    prequal_complete: boolean;
    stage: string;
  }>;

  const variants = { a: leads.filter(l => l.variant === "a"), b: leads.filter(l => l.variant === "b") };

  const summarize = (group: typeof leads) => ({
    total:          group.length,
    prequal:        group.filter(l => l.prequal_complete).length,
    prequal_rate:   group.length ? group.filter(l => l.prequal_complete).length / group.length : 0,
    closed:         group.filter(l => l.stage === "closed").length,
    dead:           group.filter(l => l.stage === "dead").length,
  });

  return { a: summarize(variants.a), b: summarize(variants.b) };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const experiments = await db.experiments.list();

  // Attach results to each experiment
  const withResults = await Promise.all(
    experiments.map(async (exp) => {
      const results = await getResults(exp.id);
      return { ...exp, results };
    })
  );

  return NextResponse.json({ experiments: withResults });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const exp = await db.experiments.insert({
    name:          body.name,
    active:        body.active ?? false,
    traffic_split: body.traffic_split ?? 0.5,
    variant_a:     body.variant_a,
    variant_b:     body.variant_b,
  });

  return NextResponse.json({ ok: true, experiment: exp });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id   = req.nextUrl.searchParams.get("id");
  if (!id)   return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const exp  = await db.experiments.update(id, body);

  return NextResponse.json({ ok: true, experiment: exp });
}

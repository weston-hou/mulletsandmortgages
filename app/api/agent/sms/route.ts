/**
 * app/api/agent/sms/route.ts
 * POST /api/agent/sms — send an SMS to a lead via the AI agent
 *
 * Stub implementation — requires Twilio / Vapi integration.
 * Logs the request and returns 200 for now.
 *
 * Expected body: { lead_id: string, message?: string }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead_id, message } = body;

    if (!lead_id) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    // TODO: Integrate with Twilio / Vapi.ai to send actual SMS
    console.log(`[SMS stub] lead_id=${lead_id} message="${message ?? "(agent-triggered)"}"`);

    return NextResponse.json({
      success: true,
      stub: true,
      message: "SMS queued (stub — Twilio integration pending)",
    });
  } catch (err) {
    console.error("[POST /api/agent/sms]", err);
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
  }
}

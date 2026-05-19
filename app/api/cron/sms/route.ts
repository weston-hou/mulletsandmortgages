/**
 * app/api/cron/sms/route.ts
 * GET /api/cron/sms — Called by Vercel Cron every minute.
 *
 * Triggers the SMS agent's send_scheduled mode.
 * Protected by CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify the request is from Vercel Cron (or an authorized caller)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/sms] CRON_SECRET is not set — cron endpoint is unprotected!");
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Call the SMS agent's send_scheduled action internally
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const res = await fetch(`${baseUrl}/api/agent/sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward the auth token so the agent route doesn't need its own auth
      },
      body: JSON.stringify({ action: "send_scheduled" }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[cron/sms] SMS agent returned ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `SMS agent error: ${res.status}` },
        { status: 500 }
      );
    }

    const data = await res.json();
    console.log(`[cron/sms] Sent ${data.sent ?? 0} message(s)`);

    return NextResponse.json({
      ok: true,
      sent: data.sent ?? 0,
      errors: data.errors ?? [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sms] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

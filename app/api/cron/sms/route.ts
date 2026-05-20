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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const authHeader = { "Content-Type": "application/json", "Authorization": `Bearer ${cronSecret}` };

    // Run SMS scheduled sends + email sequence in parallel
    const [smsRes, emailRes] = await Promise.all([
      fetch(`${baseUrl}/api/agent/sms`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ action: "send_scheduled" }),
      }),
      fetch(`${baseUrl}/api/agent/email`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ action: "send_sequence" }),
      }),
    ]);

    const smsData  = smsRes.ok  ? await smsRes.json()  : { sent: 0, error: `sms ${smsRes.status}` };
    const emailData = emailRes.ok ? await emailRes.json() : { sent: 0, error: `email ${emailRes.status}` };

    console.log(`[cron] SMS sent: ${smsData.sent ?? 0}, Email sent: ${emailData.sent ?? 0}`);

    return NextResponse.json({
      ok: true,
      sms_sent: smsData.sent ?? 0,
      email_sent: emailData.sent ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sms] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

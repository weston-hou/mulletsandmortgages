/**
 * lib/notify-zach.ts
 * Thin wrapper — sends Zach an SMS via Twilio.
 * Extracted so other modules can import without pulling in the full SMS agent.
 */

export default async function notifyZach(message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE_NUMBER;
  const to         = process.env.ZACH_PHONE;

  if (!accountSid || !authToken || !from || !to) {
    console.warn("[notify-zach] Missing Twilio config or ZACH_PHONE — skipping");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[notify-zach] Twilio error (${res.status}): ${text}`);
  }
}

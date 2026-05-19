/**
 * lib/email.ts
 * Resend email sender for Mullets & Mortgages.
 *
 * Requires RESEND_API_KEY env var.
 * From address: Zachary Boyko <zach@mulletsandmortgages.com>
 */

const RESEND_API = "https://api.resend.com/emails";
const FROM = "Zachary Boyko <zach@mulletsandmortgages.com>";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo ?? "zach@mulletsandmortgages.com",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error (${res.status}): ${text}`);
  }

  const data: { id: string } = await res.json();
  return data.id;
}

// ─── Pre-qual letter email ────────────────────────────────────────────────────

interface PrequalEmailOptions {
  firstName: string;
  lastName: string;
  email: string;
  letterUrl: string;
  priceRange?: string;
  expiryDays?: number;
}

export function buildPrequalEmailHtml(opts: PrequalEmailOptions): string {
  const {
    firstName,
    letterUrl,
    priceRange,
    expiryDays = 45,
  } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Pre-Qualification Letter</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f0; font-family: Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
    .accent { height: 6px; background: linear-gradient(90deg, #f59e0b, #d97706); }
    .body { padding: 40px 48px; }
    .logo { font-size: 22px; font-weight: 900; color: #1a1a1a; margin-bottom: 32px; }
    .logo span { color: #d97706; }
    h1 { font-size: 24px; font-weight: 900; color: #1a1a1a; margin: 0 0 8px; }
    p { font-size: 15px; line-height: 1.7; color: #444; margin: 0 0 16px; }
    .highlight-box {
      background: #fffbeb;
      border: 1.5px solid #f59e0b;
      border-radius: 8px;
      padding: 20px 24px;
      margin: 24px 0;
    }
    .highlight-box .label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #d97706; font-weight: 700; margin-bottom: 4px; }
    .highlight-box .value { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .cta {
      display: inline-block;
      background: #f59e0b;
      color: #000000;
      font-weight: 900;
      font-size: 15px;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      margin: 8px 0 24px;
    }
    .footer { padding: 24px 48px; background: #f9f9f7; border-top: 1px solid #e5e5e5; }
    .footer p { font-size: 11px; color: #999; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="accent"></div>
    <div class="body">
      <div class="logo">✂️ Mullets <span>&</span> Mortgages</div>

      <h1>You're pre-qualified, ${firstName}! 🎉</h1>
      <p>
        Great news — your pre-qualification is complete. Your letter is ready to
        view, download, and share with your real estate agent.
      </p>

      ${priceRange ? `
      <div class="highlight-box">
        <div class="label">Pre-Qualified Up To</div>
        <div class="value">${priceRange}</div>
      </div>
      ` : ""}

      <p>Click below to open your letter. You can print it or save it as a PDF directly from the page.</p>

      <a href="${letterUrl}" class="cta">📄 View My Pre-Qual Letter →</a>

      <p style="font-size:13px; color:#888;">
        This letter is valid for ${expiryDays} days. If you have any questions or your
        scenario changes, just reply to this email or call Zach directly at
        <a href="tel:6024101334" style="color:#d97706;">(602) 410-1334</a>.
      </p>
    </div>
    <div class="footer">
      <p>
        Zachary Boyko · Mortgage Broker · NMLS #2004025<br />
        BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender<br />
        <a href="https://mulletsandmortgages.com" style="color:#d97706;">mulletsandmortgages.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * lib/rates-email.ts
 * Builds the HTML email for the rates quote flow.
 *
 * Dark card design matching the mulletsandmortgages.com rates page aesthetic.
 * Personal tone from Zach. 2 pts applied label on each card.
 * Pre-qual + full application CTAs.
 */

export interface RateCardData {
  badge:     string;   // "Best Match", "Build equity faster", etc.
  rate:      number;   // displayed rate (2 pts already applied)
  apr:       number;
  type:      string;   // "30-yr Fixed", "15-yr Fixed", etc.
  payment:   number | null;
  note?:     string;
  highlight: boolean;
}

export interface RatesEmailOptions {
  firstName:    string;
  email:        string;
  purpose:      string;
  price:        string;   // formatted, e.g. "$450,000"
  downPayment:  string;   // formatted, e.g. "$90,000"
  credit:       string;
  zip:          string;
  cards:        RateCardData[];
  prequal_url:  string;
  apply_url:    string;
}

function cardHtml(card: RateCardData): string {
  const borderColor = card.highlight ? "#d97706" : "#3f3f46";
  const bgColor     = card.highlight ? "rgba(217,119,6,0.06)" : "#18181b";
  const badgeBg     = card.highlight ? "rgba(251,191,36,0.15)" : "rgba(161,161,170,0.12)";
  const badgeColor  = card.highlight ? "#fbbf24" : "#a1a1aa";
  const starPrefix  = card.highlight ? "⭐ " : "";

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border-collapse:collapse;">
    <tr>
      <td style="background:${bgColor};border:1.5px solid ${borderColor};border-radius:12px;padding:18px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px;letter-spacing:0.02em;">${starPrefix}${card.badge}</div>
              <div style="font-size:32px;font-weight:900;color:#ffffff;line-height:1;">${card.rate.toFixed(3)}%</div>
              <div style="font-size:13px;color:#a1a1aa;margin-top:4px;">
                ${card.type} &nbsp;·&nbsp; APR ${card.apr.toFixed(3)}%
                ${card.note ? `<span style="color:#71717a;"> (${card.note})</span>` : ""}
              </div>
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
              ${card.payment ? `
                <div style="font-size:11px;color:#71717a;">Est. payment</div>
                <div style="font-size:16px;font-weight:700;color:#ffffff;">$${card.payment.toLocaleString()}/mo</div>
              ` : ""}
              <div style="font-size:11px;color:#52525b;margin-top:4px;">2 pts applied</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

export function buildRatesEmailHtml(opts: RatesEmailOptions): string {
  const { firstName, purpose, price, downPayment, credit, zip, cards, prequal_url, apply_url } = opts;

  const scenarioLine = [
    purpose,
    price       || null,
    downPayment ? `${downPayment} down` : null,
    credit      || null,
    zip ? `AZ ${zip}` : null,
  ].filter(Boolean).join(" · ");

  const cardsHtml = cards.map(cardHtml).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Rate Options</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr><td style="padding-bottom:28px;">
            <span style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
              ✂️ Mullets <span style="color:#d97706;">&amp;</span> Mortgages
            </span>
          </td></tr>

          <!-- Headline -->
          <tr><td style="padding-bottom:6px;">
            <h1 style="margin:0;font-size:28px;font-weight:900;color:#ffffff;line-height:1.2;">
              Hey ${firstName}, here are your options
            </h1>
          </td></tr>

          <!-- Scenario -->
          <tr><td style="padding-bottom:4px;">
            <p style="margin:0;font-size:13px;color:#71717a;">
              Based on: <span style="color:#a1a1aa;">${scenarioLine}</span>
            </p>
          </td></tr>

          <!-- Timestamp note -->
          <tr><td style="padding-bottom:22px;">
            <p style="margin:0;font-size:11px;color:#52525b;">Live rates as of today · Personalized to your scenario</p>
          </td></tr>

          <!-- Rate cards -->
          <tr><td style="padding-bottom:8px;">${cardsHtml}</td></tr>

          <!-- Disclaimer -->
          <tr><td style="padding-bottom:28px;">
            <p style="margin:0;font-size:11px;color:#52525b;line-height:1.6;">
              Rates shown reflect current lender pricing with a 2-point buydown applied. Actual rate depends on full credit review and final lender approval. Not a commitment to lend.
            </p>
          </td></tr>

          <!-- Divider -->
          <tr><td style="border-top:1px solid #27272a;padding-bottom:28px;"></td></tr>

          <!-- Personal note -->
          <tr><td style="padding-bottom:28px;">
            <p style="margin:0 0 14px;font-size:15px;color:#d4d4d4;line-height:1.7;">
              Hey ${firstName} — I pulled these straight from my pricing engine and applied 2 points so you can see what the rate looks like with a little buydown baked in. These are real numbers from real lenders I shop for you.
            </p>
            <p style="margin:0 0 14px;font-size:15px;color:#d4d4d4;line-height:1.7;">
              If any of these look good, the fastest next step is a quick pre-qual — takes about 2 minutes and there's no credit pull. That gets you a letter you can take to your agent so you're ready to make an offer when you find the right place.
            </p>
            <p style="margin:0;font-size:15px;color:#d4d4d4;line-height:1.7;">
              Or go straight to a full application if you're ready. Either way, just reply to this email or call me at <a href="tel:6024101334" style="color:#d97706;text-decoration:none;">(602) 410-1334</a> if you have questions.
            </p>
          </td></tr>

          <!-- CTAs -->
          <tr><td style="padding-bottom:32px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="48%" style="padding-right:8px;">
                  <a href="${prequal_url}" style="display:block;background:#f59e0b;color:#000000;font-weight:900;font-size:14px;text-align:center;text-decoration:none;padding:14px 20px;border-radius:10px;">
                    Get Pre-Qualified →
                  </a>
                </td>
                <td width="48%" style="padding-left:8px;">
                  <a href="${apply_url}" style="display:block;background:transparent;color:#ffffff;font-weight:700;font-size:14px;text-align:center;text-decoration:none;padding:13px 20px;border-radius:10px;border:1.5px solid #3f3f46;">
                    Start Full Application
                  </a>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Footer -->
          <tr><td style="border-top:1px solid #1c1c1f;padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#71717a;line-height:1.8;">
              Zachary Boyko · Mortgage Broker · NMLS #2004025<br />
              BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender<br />
              <a href="https://mulletsandmortgages.com" style="color:#d97706;text-decoration:none;">mulletsandmortgages.com</a>
              &nbsp;·&nbsp;
              <a href="tel:6024101334" style="color:#d97706;text-decoration:none;">(602) 410-1334</a>
            </p>
          </td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * lib/claude-email-agent.ts
 * Claude-powered email conversation engine for Mullets & Mortgages.
 *
 * Writes as Zach Boyko in first person. No AI disclosure — this is Zach's voice.
 * Handles the full pre-qual email sequence:
 *   1. Intro / rate delivery
 *   2. Pre-qual info collection (one field per email, conversational)
 *   3. Handoff to full application when ready
 */

import { db } from "@/lib/supabase";
import type { Lead, Conversation } from "@/lib/supabase";
import type { PrequalFields } from "@/lib/scripts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailAgentResult {
  subject: string;
  html: string;
  text: string;
  extractedFields: Partial<PrequalFields>;
  shouldHandoffToZach: boolean;
  handoffReason?: string;
  sequenceComplete: boolean;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildEmailSystemPrompt(
  lead: Lead,
  collectedFields: Partial<PrequalFields>,
  isFirstEmail: boolean
): string {
  const missing = getMissingPrequalFields(collectedFields);
  const nextField = missing[0] ?? null;
  const complete = missing.length === 0;

  const nextQuestion = nextField ? FIELD_QUESTIONS[nextField] : null;

  return `You are Zachary Boyko, a licensed mortgage broker at Mullets & Mortgages (mulletsandmortgages.com).
NMLS #2004025. You work with 150+ lenders across 48 states.

You are writing a real email to a mortgage lead. Write in first person as Zach. This is your genuine voice — 
casual, direct, warm, and knowledgeable. Do NOT mention AI, automation, or assistants. This is Zach writing.

## Lead info
Name: ${lead.first_name} ${lead.last_name}
Email: ${lead.email}
Loan purpose: ${lead.loan_purpose ?? "purchase"}
Price range: ${lead.estimated_price ?? "not specified"}
Credit score: ${lead.credit_score ?? "not specified"}
State: ${lead.state ?? "not specified"}
Zip: ${lead.zip ?? "not specified"}
Property type: ${lead.property_type ?? "not specified"}
Down payment: ${lead.down_payment ?? "not specified"}

## Pre-qual fields already collected
Full legal name: ${collectedFields.full_name ?? "not yet"}
Subject property zip: ${collectedFields.prequal_zip ?? "not yet"}
Employment history: ${collectedFields.prequal_employment ?? "not yet"}
Annual income: ${collectedFields.prequal_income ?? "not yet"}
Monthly liabilities: ${collectedFields.prequal_liabilities ?? "not yet"}
Confirmed credit score: ${collectedFields.prequal_credit_score ?? "not yet"}

## Your task
${isFirstEmail
  ? `This is the FIRST email to this lead. 
  - Introduce yourself briefly (1–2 sentences max — they already know who you are from the site)
  - Tell them you've reviewed their scenario and pulled some rate options
  - Point them to ${`https://mulletsandmortgages.com/rates?name=${encodeURIComponent(lead.first_name)}&purpose=${encodeURIComponent(lead.loan_purpose ?? "")}&price=${encodeURIComponent(lead.estimated_price ?? "")}&credit=${encodeURIComponent(lead.credit_score ?? "")}&state=${encodeURIComponent(lead.state ?? "")}&zip=${encodeURIComponent(lead.zip ?? "")}`} to see current rates
  - Ask the ONE pre-qual question: "${nextQuestion ?? "Are you ready to move forward?"}"
  - Keep it SHORT — 4–6 sentences total. No fluff.`
  : complete
  ? `Pre-qual is COMPLETE. Write a warm, brief email:
  - Congratulate them — they have everything Zach needs
  - Tell them the next step is a full application at https://mulletsandmortgages.com/apply or https://prod.lendingpad.com/adaxa-home/pos#/?loid=c4d5c50b-bce5-4a80-8f65-2bac9bb4d12f
  - Keep it to 3–4 sentences`
  : `This is a FOLLOW-UP email in an ongoing pre-qual conversation.
  - Acknowledge what they said in their last reply naturally
  - Extract any pre-qual info they shared
  - Ask the NEXT single question: "${nextQuestion}"
  - Keep it conversational and SHORT — 3–5 sentences max
  - Do NOT list multiple questions`}

## Tone rules
- Casual and real — like a text from a knowledgeable friend, not a corporate email
- No jargon unless you explain it
- Warm but efficient — Zach respects their time
- No exclamation point spam. One per email max.
- Sign off as: Zach (not "Best regards, Zachary Boyko")

## Email format rules
- Subject line: short, personal, no "Re:" unless it's a reply
- Body: plain conversational paragraphs — NO bullet lists, NO bold headers
- Signature block at the end (HTML): Zach Boyko | Mortgage Broker | NMLS #2004025 | (602) 410-1334 | mulletsandmortgages.com
- The HTML should be clean and minimal — dark text on white, amber accent color #f59e0b for any links

## Response format — MUST be valid JSON:
{
  "subject": "email subject line",
  "bodyText": "plain text version of the email body",
  "bodyHtml": "full HTML email body including signature",
  "extractedFields": {
    "full_name": "string or null",
    "prequal_zip": "string or null",
    "prequal_employment": "string or null",
    "prequal_income": "string or null",
    "prequal_liabilities": "string or null",
    "prequal_credit_score": "string or null"
  },
  "shouldHandoffToZach": false,
  "handoffReason": null,
  "sequenceComplete": false
}

Set sequenceComplete: true only when ALL pre-qual fields are collected.
Set shouldHandoffToZach: true if the lead asks something complex, mentions bankruptcy/foreclosure, or asks to speak directly with Zach.`;
}

// ─── Pre-qual fields ──────────────────────────────────────────────────────────

const PREQUAL_FIELD_ORDER: (keyof PrequalFields)[] = [
  "full_name",
  "prequal_zip",
  "prequal_employment",
  "prequal_income",
  "prequal_liabilities",
  "prequal_credit_score",
];

const FIELD_QUESTIONS: Record<keyof PrequalFields, string> = {
  full_name:            "What's your full legal name as it appears on your ID?",
  prequal_zip:          "What zip code is the property you're looking at?",
  prequal_employment:   "How long have you been at your current job, and are you W2 or self-employed?",
  prequal_income:       "What's your gross annual income (before taxes)?",
  prequal_liabilities:  "Any monthly debt payments I should know about — car loans, student loans, credit cards?",
  prequal_credit_score: "And just to confirm — what credit score range are you seeing these days?",
};

function getMissingPrequalFields(
  collected: Partial<PrequalFields>
): (keyof PrequalFields)[] {
  return PREQUAL_FIELD_ORDER.filter((f) => !collected[f]);
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data: { content: Array<{ type: string; text: string }> } = await res.json();
  const text = data.content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text");
  return text;
}

// ─── HTML email wrapper ───────────────────────────────────────────────────────

function wrapEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #f5f5f0; font-family: Arial, sans-serif; color: #1a1a1a; }
    .wrapper { max-width: 580px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.07); }
    .accent { height: 5px; background: linear-gradient(90deg, #f59e0b, #d97706); }
    .body { padding: 36px 44px; }
    .logo { font-size: 18px; font-weight: 900; color: #1a1a1a; margin-bottom: 28px; }
    .logo span { color: #d97706; }
    p { font-size: 15px; line-height: 1.75; color: #333; margin: 0 0 16px; }
    a { color: #d97706; }
    .sig { margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #888; line-height: 1.6; }
    .footer { padding: 20px 44px; background: #f9f9f7; border-top: 1px solid #eee; }
    .footer p { font-size: 11px; color: #bbb; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="accent"></div>
    <div class="body">
      <div class="logo">✂️ Mullets <span>&</span> Mortgages</div>
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Zachary Boyko · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533 · Equal Housing Lender<br />
      <a href="https://mulletsandmortgages.com" style="color:#d97706;">mulletsandmortgages.com</a> · 
      <a href="https://mulletsandmortgages.com/privacy" style="color:#bbb;">Privacy Policy</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateEmailAgentReply(params: {
  lead: Lead;
  conversationHistory: Conversation[];
  inboundMessage?: string;   // undefined for first outbound email
  collectedFields: Partial<PrequalFields>;
}): Promise<EmailAgentResult> {
  const { lead, conversationHistory, inboundMessage, collectedFields } = params;
  const isFirstEmail = conversationHistory.length === 0 && !inboundMessage;

  // Build message history for Claude
  const messages: ClaudeMessage[] = conversationHistory.map((c) => ({
    role: c.direction === "inbound" ? "user" : "assistant",
    content: c.body,
  }));

  if (inboundMessage) {
    messages.push({ role: "user", content: inboundMessage });
  }

  // For first email, seed with a minimal user message so Claude has context
  if (isFirstEmail) {
    messages.push({
      role: "user",
      content: `[Lead ${lead.first_name} ${lead.last_name} just submitted the form. Write the first outreach email.]`,
    });
  }

  const systemPrompt = buildEmailSystemPrompt(lead, collectedFields, isFirstEmail);

  let rawText: string;
  try {
    rawText = await callClaude(messages, systemPrompt);
  } catch (err) {
    console.error("[email-agent] Claude API failed:", err);
    // Fallback — queue for Zach to handle manually
    return {
      subject: `Your mortgage rates — ${lead.first_name}`,
      html: wrapEmailHtml(`<p>Hi ${lead.first_name},</p><p>Thanks for reaching out! I've pulled some rate options for you — I'll be in touch shortly to walk you through everything.</p><p>— Zach</p>`),
      text: `Hi ${lead.first_name},\n\nThanks for reaching out! I've pulled some rate options for you — I'll be in touch shortly.\n\n— Zach`,
      extractedFields: {},
      shouldHandoffToZach: true,
      handoffReason: "Claude API failure",
      sequenceComplete: false,
    };
  }

  // Parse JSON from Claude
  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    rawText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    console.error("[email-agent] No JSON in Claude response:", rawText);
    return {
      subject: `Following up — ${lead.first_name}`,
      html: wrapEmailHtml(`<p>${rawText}</p>`),
      text: rawText,
      extractedFields: {},
      shouldHandoffToZach: false,
      sequenceComplete: false,
    };
  }

  let parsed: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
    extractedFields: Record<string, string | null>;
    shouldHandoffToZach: boolean;
    handoffReason?: string | null;
    sequenceComplete: boolean;
  };

  try {
    parsed = JSON.parse(jsonMatch[1]);
  } catch (err) {
    console.error("[email-agent] JSON parse failed:", err);
    return {
      subject: `Following up — ${lead.first_name}`,
      html: wrapEmailHtml(`<p>${rawText}</p>`),
      text: rawText,
      extractedFields: {},
      shouldHandoffToZach: false,
      sequenceComplete: false,
    };
  }

  // Strip nulls from extractedFields
  const extractedFields: Partial<PrequalFields> = {};
  for (const [k, v] of Object.entries(parsed.extractedFields ?? {})) {
    if (v !== null && v !== undefined && v !== "") {
      (extractedFields as Record<string, string>)[k] = v;
    }
  }

  return {
    subject: parsed.subject ?? `Following up — ${lead.first_name}`,
    html: wrapEmailHtml(parsed.bodyHtml ?? `<p>${parsed.bodyText}</p>`),
    text: parsed.bodyText ?? "",
    extractedFields,
    shouldHandoffToZach: Boolean(parsed.shouldHandoffToZach),
    handoffReason: parsed.handoffReason ?? undefined,
    sequenceComplete: Boolean(parsed.sequenceComplete),
  };
}

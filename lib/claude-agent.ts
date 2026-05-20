/**
 * lib/claude-agent.ts
 * Claude-powered SMS conversation engine for the Mullets & Mortgages AI agent.
 *
 * Uses direct fetch() to api.anthropic.com — no @anthropic-ai/sdk required.
 */

import type { Lead, Conversation } from "@/lib/supabase";
import type { ScriptConfig, PrequalFields } from "@/lib/scripts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentReplyResult {
  reply: string;
  extractedFields: Partial<PrequalFields>;
  shouldEscalateToCall: boolean;
  shouldHandoffToZach: boolean;
  handoffReason?: string;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  lead: Lead,
  scriptConfig: ScriptConfig,
  collectedFields: Partial<PrequalFields>
): string {
  const missingFields = getMissingPrequalFields(collectedFields);
  const missingList =
    missingFields.length > 0
      ? missingFields
          .map((f) => {
            const prompt = scriptConfig.prequal_prompts.find(
              (p) => p.field === f
            );
            return `- ${f}: "${prompt?.prompt ?? f}"`;
          })
          .join("\n")
      : "All pre-qual fields collected! 🎉";

  return `You are the AI assistant for Zach Boyko at Mullets & Mortgages (mulletsandmortgages.com).
Zach is a licensed mortgage broker (NMLS #2004025) working with 150+ lenders across 48 states.

## Your role
You help mortgage leads get pre-qualified via SMS. You are NOT Zach — you are his assistant.
If asked about specific rates, exact numbers, or professional mortgage advice, always say Zach will follow up personally.

## Lead context
Name: ${lead.first_name} ${lead.last_name}
Phone: ${lead.phone}
Loan purpose: ${lead.loan_purpose ?? "not specified"}
Estimated price: ${lead.estimated_price ?? "not specified"}
Credit score (initial): ${lead.credit_score ?? "not specified"}
State: ${lead.state ?? "not specified"}
Zip: ${lead.zip ?? "not specified"}
Property type: ${lead.property_type ?? "not specified"}
Down payment: ${lead.down_payment ?? "not specified"}
Pipeline stage: ${lead.stage}

## Fields already collected
Full name: ${collectedFields.full_name ?? "not yet"}
Subject property zip: ${collectedFields.prequal_zip ?? "not yet"}
Employment: ${collectedFields.prequal_employment ?? "not yet"}
Annual income: ${collectedFields.prequal_income ?? "not yet"}
Monthly liabilities: ${collectedFields.prequal_liabilities ?? "not yet"}
Credit score (confirmed): ${collectedFields.prequal_credit_score ?? "not yet"}

## Pre-qual fields still needed (collect naturally in order)
${missingList}

## Tone & personality
- Warm, optimistic, and inspirational — but ALWAYS honest and realistic about affordability
- If the numbers look tight, say so kindly rather than giving false hope
- Never oversell or make specific rate promises
- Encouraging and human — not robotic or scripted
- Keep messages SHORT: 1–3 sentences max. This is SMS, not email.
- Use light emojis sparingly (max 1 per message), only when they feel natural

## TCPA compliance
- The first message already includes opt-out info
- Never pressure or harass
- Honor all opt-out requests immediately

## Collecting pre-qual fields
- Collect them naturally in conversation — don't interrogate
- One question at a time, in the order listed above
- If a lead volunteers information for a later field, capture it and skip that prompt later
- Don't repeat questions they've already answered

## Escalation rules
You MUST set shouldEscalateToCall: true if:
- The lead explicitly asks for a phone call
- The conversation has 8+ turns and pre-qual is still not complete
- The lead has complex layered questions beyond basic pre-qual

You MUST set shouldHandoffToZach: true if:
- The lead seems frustrated, confused, or upset
- The lead asks to speak to a human
- The lead asks a complex rate/program question you can't confidently answer
- You detect a tricky mortgage scenario (bankruptcy, foreclosure, unique property type, DSCR, etc.)

## Response format
You MUST respond with valid JSON matching this exact shape:
{
  "reply": "your SMS reply here",
  "extractedFields": {
    "full_name": "string or null",
    "prequal_zip": "string or null",
    "prequal_employment": "string or null",
    "prequal_income": "string or null",
    "prequal_liabilities": "string or null",
    "prequal_credit_score": "string or null"
  },
  "shouldEscalateToCall": false,
  "shouldHandoffToZach": false,
  "handoffReason": null
}

Only include fields in extractedFields that were mentioned in THIS conversation turn.
Set extractedFields values to null if not mentioned.
The "reply" should be the exact SMS message text to send.`;
}

// ─── Pre-qual field helpers ───────────────────────────────────────────────────

const PREQUAL_FIELD_ORDER: (keyof PrequalFields)[] = [
  "full_name",
  "prequal_zip",
  "prequal_employment",
  "prequal_income",
  "prequal_liabilities",
  "prequal_credit_score",
];

function getMissingPrequalFields(
  collected: Partial<PrequalFields>
): (keyof PrequalFields)[] {
  return PREQUAL_FIELD_ORDER.filter((f) => !collected[f]);
}

// ─── Claude API call ──────────────────────────────────────────────────────────

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
      model: "claude-3-haiku-20240307",
      max_tokens: 512,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data: ClaudeResponse = await res.json();
  const text = data.content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text content");
  return text;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateAgentReply(params: {
  lead: Lead;
  conversationHistory: Conversation[];
  newMessage: string;
  scriptConfig: ScriptConfig;
  collectedFields: Partial<PrequalFields>;
}): Promise<AgentReplyResult> {
  const { lead, conversationHistory, newMessage, scriptConfig, collectedFields } =
    params;

  // Build Claude message history from conversation DB records
  const messages: ClaudeMessage[] = conversationHistory.map((c) => ({
    role: c.direction === "inbound" ? "user" : "assistant",
    content: c.body,
  }));

  // Append the new inbound message
  messages.push({ role: "user", content: newMessage });

  const systemPrompt = buildSystemPrompt(lead, scriptConfig, collectedFields);

  let rawText: string;
  try {
    rawText = await callClaude(messages, systemPrompt);
  } catch (err) {
    console.error("[claude-agent] API call failed:", err);
    // Graceful fallback — don't drop the conversation
    return {
      reply:
        "Hey! Got your message — I'll make sure Zach follows up with you shortly. Thanks for your patience! 🙏",
      extractedFields: {},
      shouldEscalateToCall: false,
      shouldHandoffToZach: true,
      handoffReason: "Claude API failure — manual follow-up needed",
    };
  }

  // Parse JSON from Claude's response
  // Claude sometimes wraps JSON in markdown code blocks
  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    rawText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    console.error("[claude-agent] No JSON found in response:", rawText);
    return {
      reply: rawText.trim().slice(0, 320), // SMS length guard
      extractedFields: {},
      shouldEscalateToCall: false,
      shouldHandoffToZach: false,
    };
  }

  let parsed: {
    reply: string;
    extractedFields: Record<string, string | null>;
    shouldEscalateToCall: boolean;
    shouldHandoffToZach: boolean;
    handoffReason?: string | null;
  };

  try {
    parsed = JSON.parse(jsonMatch[1]);
  } catch (err) {
    console.error("[claude-agent] JSON parse failed:", err, rawText);
    return {
      reply: rawText.trim().slice(0, 320),
      extractedFields: {},
      shouldEscalateToCall: false,
      shouldHandoffToZach: false,
    };
  }

  // Strip null values from extractedFields
  const extractedFields: Partial<PrequalFields> = {};
  for (const [k, v] of Object.entries(parsed.extractedFields ?? {})) {
    if (v !== null && v !== undefined && v !== "") {
      (extractedFields as Record<string, string>)[k] = v;
    }
  }

  return {
    reply: (parsed.reply ?? "").trim().slice(0, 1600), // MMS length guard
    extractedFields,
    shouldEscalateToCall: Boolean(parsed.shouldEscalateToCall),
    shouldHandoffToZach: Boolean(parsed.shouldHandoffToZach),
    handoffReason: parsed.handoffReason ?? undefined,
  };
}

/**
 * Generate the first outbound message for a new lead using their script.
 */
export function generateIntroMessage(
  lead: Lead,
  scriptConfig: ScriptConfig
): string {
  const vars: Record<string, string> = {
    first_name: lead.first_name,
    loan_purpose: (lead.loan_purpose ?? "a home purchase").toLowerCase(),
    zip: lead.zip ?? lead.prequal_zip ?? "your area",
  };

  // Replace {{key}} template vars
  return scriptConfig.intro.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? ""
  );
}

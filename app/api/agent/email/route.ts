/**
 * app/api/agent/email/route.ts
 *
 * POST /api/agent/email
 *
 * Handles two flows:
 *
 * 1. action: "trigger" + lead_id
 *    Called right after lead creation (for email-preference leads).
 *    Sends the first outreach email as Zach.
 *
 * 2. action: "reply" + lead_id + message (inbound email body)
 *    Called by the inbound email webhook (Resend inbound or manual relay).
 *    Generates a reply, sends it, logs the exchange.
 *
 * 3. action: "send_sequence" (cron-driven)
 *    Picks up any leads whose preferred_contact=email and haven't been
 *    emailed yet, sends their first outreach.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { generateEmailAgentReply } from "@/lib/claude-email-agent";
import { sendEmail } from "@/lib/email";
import type { PrequalFields } from "@/lib/scripts";
import type { Lead } from "@/lib/supabase";

// ─── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_PASSWORD;
  const cronSecret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("X-Admin-Key") ??
    req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!provided) return false;
  if (adminKey && provided === adminKey) return true;
  if (cronSecret && provided === cronSecret) return true;
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCollectedFields(lead: Lead): Partial<PrequalFields> {
  const fields: Partial<PrequalFields> = {};
  if (lead.prequal_full_name)   fields.full_name            = lead.prequal_full_name;
  if (lead.prequal_zip)         fields.prequal_zip          = lead.prequal_zip;
  if (lead.prequal_employment)  fields.prequal_employment   = lead.prequal_employment;
  if (lead.prequal_income)      fields.prequal_income       = lead.prequal_income;
  if (lead.prequal_liabilities) fields.prequal_liabilities  = lead.prequal_liabilities;
  if (lead.prequal_credit_score)fields.prequal_credit_score = lead.prequal_credit_score;
  return fields;
}

async function runEmailAgent(lead: Lead, inboundMessage?: string) {
  if (!lead.email) {
    console.warn(`[email-agent] Lead ${lead.id} has no email address`);
    return { sent: false, reason: "no_email" };
  }

  // Load conversation history (email channel only)
  const allConversations = await db.conversations.forLead(lead.id);
  const conversations = allConversations.filter(c => c.channel === "email");
  const collectedFields = extractCollectedFields(lead);

  // Generate reply
  const result = await generateEmailAgentReply({
    lead,
    conversationHistory: conversations,
    inboundMessage,
    collectedFields,
  });

  // Log outbound in conversations
  await db.conversations.insert({
    lead_id: lead.id,
    channel: "email",
    direction: "outbound",
    body: result.text,
    ai_generated: true,
    metadata: {
      subject: result.subject,
      sequence_complete: result.sequenceComplete,
      handoff: result.shouldHandoffToZach,
    },
  });

  // Send the email
  await sendEmail({
    to: lead.email,
    subject: result.subject,
    html: result.html,
    replyTo: "zach@mulletsandmortgages.com",
  });

  // Persist any extracted pre-qual fields
  if (Object.keys(result.extractedFields).length > 0) {
    const updates: Partial<Lead> = {};
    if (result.extractedFields.full_name)
      updates.prequal_full_name = result.extractedFields.full_name;
    if (result.extractedFields.prequal_zip)
      updates.prequal_zip = result.extractedFields.prequal_zip;
    if (result.extractedFields.prequal_employment)
      updates.prequal_employment = result.extractedFields.prequal_employment;
    if (result.extractedFields.prequal_income)
      updates.prequal_income = result.extractedFields.prequal_income;
    if (result.extractedFields.prequal_liabilities)
      updates.prequal_liabilities = result.extractedFields.prequal_liabilities;
    if (result.extractedFields.prequal_credit_score)
      updates.prequal_credit_score = result.extractedFields.prequal_credit_score;
    await db.leads.update(lead.id, updates);
  }

  // Mark prequal complete
  if (result.sequenceComplete) {
    await db.leads.update(lead.id, {
      prequal_complete: true,
      prequal_completed_at: new Date().toISOString(),
      stage: "pre_qual",
    });
  }

  // Update contact tracking
  await db.leads.update(lead.id, {
    last_contacted_at: new Date().toISOString(),
    last_contact_channel: "email",
    contact_count: (lead.contact_count ?? 0) + 1,
  });

  console.log(`[email-agent] Sent email to ${lead.email} — subject: "${result.subject}"`);
  return { sent: true, subject: result.subject, handoff: result.shouldHandoffToZach };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, lead_id, message } = body;

    // ── trigger: send first email for a specific lead ──
    if (action === "trigger") {
      if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

      const leads = await db.leads.list({ id: `eq.${lead_id}`, limit: "1" });
      const lead = leads[0];
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

      const result = await runEmailAgent(lead);
      return NextResponse.json(result);
    }

    // ── reply: handle inbound email reply from lead ──
    if (action === "reply") {
      if (!lead_id || !message) {
        return NextResponse.json({ error: "lead_id and message required" }, { status: 400 });
      }

      const leads = await db.leads.list({ id: `eq.${lead_id}`, limit: "1" });
      const lead = leads[0];
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

      // Log the inbound message first
      await db.conversations.insert({
        lead_id: lead.id,
        channel: "email",
        direction: "inbound",
        body: message,
        ai_generated: false,
      });

      const result = await runEmailAgent(lead, message);
      return NextResponse.json(result);
    }

    // ── send_sequence: cron — pick up uncontacted email-preference leads ──
    if (action === "send_sequence") {
      const leads = await db.leads.list({
        preferred_contact: "eq.email",
        last_contacted_at: "is.null",
        email: "not.is.null",
        stage: "eq.new",
        utm_source: "not.eq.rates_quote", // skip leads who got rates email
        limit: "20",
        order: "created_at.asc",
      });

      let sent = 0;
      for (const lead of leads) {
        try {
          await runEmailAgent(lead);
          sent++;
          // Small delay between sends to avoid rate limits
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`[email-agent] Failed for lead ${lead.id}:`, err);
        }
      }

      return NextResponse.json({ sent });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/agent/email] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

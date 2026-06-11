/**
 * app/api/agent/sms/route.ts
 * POST /api/agent/sms — AI-powered SMS agent for Mullets & Mortgages
 *
 * Three modes, determined by the `action` field in the request body:
 *
 *   action: "trigger"       — called when a new lead is created
 *   action: "send_scheduled" — called by cron every minute
 *   (no action / Twilio webhook) — handles inbound SMS replies from Twilio
 *
 * TCPA compliant:
 *   - All outbound messages include opt-out language on first contact
 *   - STOP/UNSUBSCRIBE/CANCEL/END/QUIT keywords handled immediately
 *   - sms_opted_out flag respected before any send
 */

import { NextRequest, NextResponse } from "next/server";
import { db, type Lead, type FollowupSchedule } from "@/lib/supabase";
import { getScript, fillTemplate, type PrequalFields } from "@/lib/scripts";
import { sendEmail, buildPrequalEmailHtml } from "@/lib/email";
import {
  generateAgentReply,
  generateIntroMessage,
} from "@/lib/claude-agent";

// ─── Twilio send helper ───────────────────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone; // already formatted or international
}

async function sendSms(to: string, body: string): Promise<string> {
  to = toE164(to);
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Missing Twilio config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio send failed (${res.status}): ${text}`);
  }

  const data: { sid: string } = await res.json();
  return data.sid;
}

/**
 * Calculate when to send the first message.
 * - Within business hours: random 4–9 min delay
 * - Outside business hours: next business day at 8:00am + 2–9 min random offset
 * - Avoids exact :00 and :30 boundaries
 */
function calculateSendAt(timingMin: number, timingMax: number): Date {
  const nowPhoenix = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
  const h = nowPhoenix.getHours();
  const d = nowPhoenix.getDay();
  const isInHours = d >= 1 && d <= 6 && h >= 8 && h < 20;

  if (isInHours) {
    // Random delay within timing window
    const delayMs = randomBetween(timingMin, timingMax) * 60_000;
    const candidate = new Date(Date.now() + delayMs);
    return avoidSharpBoundary(candidate);
  }

  // Schedule for next business day at 8am Phoenix + random 2–9 min offset
  const nextDay = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
  nextDay.setHours(8, 0, 0, 0);

  // Advance to next business day (Mon–Sat)
  do {
    nextDay.setDate(nextDay.getDate() + 1);
  } while (nextDay.getDay() === 0); // skip Sundays only

  const offsetMs = randomBetween(2, 9) * 60_000;
  const candidate = new Date(nextDay.getTime() + offsetMs);
  return avoidSharpBoundary(candidate);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Nudge a time away from :00 and :30 if needed */
function avoidSharpBoundary(d: Date): Date {
  const m = d.getMinutes();
  if (m === 0 || m === 30) {
    d.setMinutes(m + randomBetween(1, 4));
  }
  return d;
}

// ─── STOP-keyword detection ───────────────────────────────────────────────────

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);

function isStopMessage(body: string): boolean {
  return STOP_KEYWORDS.has(body.trim().toUpperCase());
}

// ─── Collect pre-qual fields from DB conversations ────────────────────────────

async function getCollectedFields(
  leadId: string,
  lead: Lead
): Promise<Partial<PrequalFields>> {
  // Seed from lead record (may already have some values from prior turns)
  const fields: Partial<PrequalFields> = {};
  if (lead.prequal_full_name) fields.full_name = lead.prequal_full_name;
  if (lead.prequal_zip) fields.prequal_zip = lead.prequal_zip;
  if (lead.prequal_employment) fields.prequal_employment = lead.prequal_employment;
  if (lead.prequal_income) fields.prequal_income = lead.prequal_income;
  if (lead.prequal_liabilities) fields.prequal_liabilities = lead.prequal_liabilities;
  if (lead.prequal_credit_score) fields.prequal_credit_score = lead.prequal_credit_score;
  return fields;
}

// ─── Notify Zach ─────────────────────────────────────────────────────────────

async function notifyZach(message: string): Promise<void> {
  const zachPhone = process.env.ZACH_PHONE;
  if (!zachPhone) {
    console.warn("[sms-agent] ZACH_PHONE not set — skipping Zach notification");
    return;
  }
  try {
    await sendSms(zachPhone, message);
  } catch (err) {
    console.error("[sms-agent] Failed to notify Zach:", err);
  }
}

// ─── Mode 1: Trigger (new lead) ───────────────────────────────────────────────

async function handleTrigger(leadId: string): Promise<NextResponse> {
  const lead = await db.leads.getById(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.sms_opted_out) {
    return NextResponse.json({
      scheduled: false,
      reason: "Lead has opted out of SMS",
    });
  }

  // Load active experiment
  const experiment = await db.experiments.getActive();
  let scriptId = "intro_v1";
  let timingMin = 4;
  let timingMax = 9;
  let variant: "a" | "b" = "a";
  let experimentId: string | undefined;

  if (experiment) {
    experimentId = experiment.id;
    // Assign variant based on traffic_split
    variant = Math.random() < experiment.traffic_split ? "a" : "b";
    const variantConfig = variant === "a" ? experiment.variant_a : experiment.variant_b;
    scriptId = variantConfig.script_id;
    timingMin = variantConfig.timing_min;
    timingMax = variantConfig.timing_max;

    // Persist experiment assignment on lead
    await db.leads.update(leadId, {
      experiment_id: experimentId,
      variant,
    });
  }

  // Calculate send time
  const sendAt = calculateSendAt(timingMin, timingMax);

  // Insert into followup_schedule
  const scheduleData: Omit<FollowupSchedule, "id" | "created_at"> = {
    lead_id: leadId,
    scheduled_at: sendAt.toISOString(),
    channel: "sms",
    stage: lead.stage,
    message_hint: "intro",
    sent: false,
    cancelled: false,
    script_id: scriptId,
    experiment_id: experimentId,
    variant,
  };

  await db.followupSchedule.insert(scheduleData);

  return NextResponse.json({
    scheduled: true,
    send_at: sendAt.toISOString(),
    script_id: scriptId,
    variant,
  });
}

// ─── Mode 2: Send scheduled ───────────────────────────────────────────────────

async function handleSendScheduled(): Promise<NextResponse> {
  const dueItems = await db.followupSchedule.getDue();

  if (dueItems.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const item of dueItems) {
    try {
      const lead = await db.leads.getById(item.lead_id);
      if (!lead) {
        console.warn(`[sms-agent] Lead not found for schedule ${item.id}`);
        continue;
      }

      if (lead.sms_opted_out) {
        // Cancel the scheduled item silently
        await db.followupSchedule.markSent(item.id);
        continue;
      }

      // Get script config
      const scriptId = item.script_id ?? "intro_v1";
      const scriptConfig = getScript(scriptId);

      // Generate message
      let messageBody: string;

      if (item.message_hint === "intro") {
        messageBody = generateIntroMessage(lead, scriptConfig);
      } else {
        // Stage-specific check-in message
        const stageMessages = scriptConfig.stage_messages[lead.stage];
        if (stageMessages && stageMessages.length > 0) {
          const raw =
            stageMessages[Math.floor(Math.random() * stageMessages.length)];
          messageBody = fillTemplate(raw, { first_name: lead.first_name });
        } else {
          messageBody = `Hey ${lead.first_name}, just checking in! Anything I can help with today? 😊`;
        }
      }

      // Send via Twilio
      if (!lead.phone) {
        console.warn(`[SMS agent] Lead ${lead.id} has no phone number, skipping`);
        return NextResponse.json({ ok: true, skipped: true });
      }
      const sid = await sendSms(lead.phone, messageBody);

      // Save outbound message to conversations
      await db.conversations.insert({
        lead_id: lead.id,
        channel: "sms",
        direction: "outbound",
        body: messageBody,
        ai_generated: item.message_hint === "intro" ? false : true,
        metadata: { twilio_sid: sid, script_id: scriptId, variant: item.variant },
      });

      // Update lead tracking
      await db.leads.update(lead.id, {
        last_contacted_at: new Date().toISOString(),
        last_contact_channel: "sms",
        contact_count: (lead.contact_count ?? 0) + 1,
      });

      // Mark schedule item sent
      await db.followupSchedule.markSent(item.id);
      sentCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sms-agent] Failed to send scheduled item ${item.id}:`, msg);
      errors.push(`${item.id}: ${msg}`);
    }
  }

  return NextResponse.json({ sent: sentCount, errors });
}

// ─── Mode 3: Twilio inbound webhook ──────────────────────────────────────────

async function handleTwilioWebhook(req: NextRequest): Promise<NextResponse> {
  // Twilio sends form-encoded data for SMS webhooks
  const formData = await req.formData();
  const from = formData.get("From") as string;
  const body = (formData.get("Body") as string) ?? "";
  const messageSid = (formData.get("MessageSid") as string) ?? "";

  if (!from) {
    return NextResponse.json({ error: "Missing From" }, { status: 400 });
  }

  // Normalize phone: ensure E.164 format
  const phone = from.trim();

  // Look up lead by phone
  const leads = await db.leads.list({ phone: `eq.${encodeURIComponent(phone)}`, limit: "1" });
  const lead = leads[0] ?? null;

  if (!lead) {
    console.warn(`[sms-agent] No lead found for phone ${phone}`);
    // TwiML empty response — don't reply to unknown numbers
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Handle STOP / opt-out
  if (isStopMessage(body)) {
    await db.leads.update(lead.id, {
      sms_opted_out: true,
      sms_opted_out_at: new Date().toISOString(),
    });

    // Save inbound
    await db.conversations.insert({
      lead_id: lead.id,
      channel: "sms",
      direction: "inbound",
      body,
      metadata: { twilio_sid: messageSid },
    });

    // Get script for ack message
    const scriptId = lead.experiment_id ? "intro_v1" : "intro_v1"; // fallback
    const scriptConfig = getScript(scriptId);

    // Send STOP acknowledgment
    try {
      const sid = await sendSms(phone, scriptConfig.stop_ack);
      await db.conversations.insert({
        lead_id: lead.id,
        channel: "sms",
        direction: "outbound",
        body: scriptConfig.stop_ack,
        ai_generated: false,
        metadata: { twilio_sid: sid, type: "stop_ack" },
      });
    } catch (err) {
      console.error("[sms-agent] Failed to send STOP ack:", err);
    }

    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // If opted out but still messaging (they may have re-subscribed via START)
  // For now, just log and skip
  if (lead.sms_opted_out) {
    await db.conversations.insert({
      lead_id: lead.id,
      channel: "sms",
      direction: "inbound",
      body,
      metadata: { twilio_sid: messageSid, note: "opted_out_lead" },
    });
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Save inbound message
  await db.conversations.insert({
    lead_id: lead.id,
    channel: "sms",
    direction: "inbound",
    body,
    metadata: { twilio_sid: messageSid },
  });

  // Load full conversation history for context
  const conversationHistory = await db.conversations.forLead(lead.id);

  // Get script config
  const scriptId = "intro_v1"; // fallback; ideally look up from lead.variant
  const scriptConfig = getScript(scriptId);

  // Get already-collected pre-qual fields
  const collectedFields = await getCollectedFields(lead.id, lead);

  // Generate AI reply
  const agentResult = await generateAgentReply({
    lead,
    conversationHistory: conversationHistory.slice(0, -1), // exclude the one we just inserted
    newMessage: body,
    scriptConfig,
    collectedFields,
  });

  // Send reply
  let replySid: string | undefined;
  try {
    replySid = await sendSms(phone, agentResult.reply);
  } catch (err) {
    console.error("[sms-agent] Failed to send reply:", err);
    // Continue to save state even if send fails
  }

  // Save outbound reply
  await db.conversations.insert({
    lead_id: lead.id,
    channel: "sms",
    direction: "outbound",
    body: agentResult.reply,
    ai_generated: true,
    metadata: { twilio_sid: replySid ?? null },
  });

  // Update lead with any newly extracted pre-qual fields
  const fieldUpdates: Partial<Lead> = {
    last_contacted_at: new Date().toISOString(),
    last_contact_channel: "sms",
    contact_count: (lead.contact_count ?? 0) + 1,
  };

  if (agentResult.extractedFields.full_name) {
    fieldUpdates.prequal_full_name = agentResult.extractedFields.full_name;
  }
  if (agentResult.extractedFields.prequal_zip) {
    fieldUpdates.prequal_zip = agentResult.extractedFields.prequal_zip;
  }
  if (agentResult.extractedFields.prequal_employment) {
    fieldUpdates.prequal_employment = agentResult.extractedFields.prequal_employment;
  }
  if (agentResult.extractedFields.prequal_income) {
    fieldUpdates.prequal_income = agentResult.extractedFields.prequal_income;
  }
  if (agentResult.extractedFields.prequal_liabilities) {
    fieldUpdates.prequal_liabilities = agentResult.extractedFields.prequal_liabilities;
  }
  if (agentResult.extractedFields.prequal_credit_score) {
    fieldUpdates.prequal_credit_score = agentResult.extractedFields.prequal_credit_score;
  }

  // Merge with existing collected fields to check completeness
  const allFields: Partial<Record<keyof PrequalFields, string>> = {
    ...collectedFields,
    ...agentResult.extractedFields,
  } as Partial<Record<keyof PrequalFields, string>>;

  const PREQUAL_KEYS: (keyof PrequalFields)[] = [
    "full_name",
    "prequal_zip",
    "prequal_employment",
    "prequal_income",
    "prequal_liabilities",
    "prequal_credit_score",
  ];

  const allComplete = PREQUAL_KEYS.every((k) => Boolean(allFields[k]));

  if (allComplete && !lead.prequal_complete) {
    fieldUpdates.prequal_complete = true;
    fieldUpdates.prequal_completed_at = new Date().toISOString();

    // Stamp the letter URL — public share link using lead ID as token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mulletsandmortgages.com";
    fieldUpdates.prequal_letter_url = `${baseUrl}/api/prequal-letter/${lead.id}?token=${lead.id}`;

    // Notify Zach: pre-qual complete
    await notifyZach(
      `🎉 Pre-qual complete for ${lead.first_name} ${lead.last_name} (${lead.phone})!\n` +
        `Income: ${agentResult.extractedFields.prequal_income ?? lead.prequal_income}\n` +
        `Credit: ${agentResult.extractedFields.prequal_credit_score ?? lead.prequal_credit_score}\n` +
        `Liabilities: ${agentResult.extractedFields.prequal_liabilities ?? lead.prequal_liabilities}\n` +
        `Letter: ${fieldUpdates.prequal_letter_url}\n` +
        `Admin: https://mulletsandmortgages.com/admin/leads/${lead.id}`
    );
  }

  await db.leads.update(lead.id, fieldUpdates);

  // Send borrower their pre-qual letter when complete
  if (fieldUpdates.prequal_letter_url) {
    const letterMsg =
      `🎉 Great news, ${lead.first_name}! Your pre-qualification letter is ready. ` +
      `You can view and download it here: ${fieldUpdates.prequal_letter_url} ` +
      `Zach will be in touch shortly. Reply STOP to opt out.`;
    try {
      if (!lead.phone) throw new Error('Lead has no phone number');
      const sid = await sendSms(lead.phone, letterMsg);
      await db.conversations.insert({
        lead_id: lead.id,
        channel: "sms",
        direction: "outbound",
        body: letterMsg,
        ai_generated: false,
        metadata: { twilio_sid: sid, type: "prequal_letter_delivery" },
      });
    } catch (err) {
      console.error("[sms-agent] Failed to send letter SMS:", err);
    }

    // Also email the letter if the lead has an email address
    if (lead.email && fieldUpdates.prequal_letter_url) {
      try {
        const html = buildPrequalEmailHtml({
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          letterUrl: fieldUpdates.prequal_letter_url,
          priceRange: lead.estimated_price,
          expiryDays: 45,
        });
        await sendEmail({
          to: lead.email,
          subject: `Your Pre-Qualification Letter is Ready, ${lead.first_name}!`,
          html,
        });
        await db.conversations.insert({
          lead_id: lead.id,
          channel: "email",
          direction: "outbound",
          body: `Pre-qual letter emailed to ${lead.email}`,
          ai_generated: false,
          metadata: { type: "prequal_letter_email" },
        });
      } catch (err) {
        console.error("[sms-agent] Failed to send letter email:", err);
      }
    }
  }

  // Handoff notification to Zach
  if (agentResult.shouldHandoffToZach) {
    await notifyZach(
      `⚠️ Handoff needed for ${lead.first_name} ${lead.last_name} (${lead.phone})\n` +
        `Reason: ${agentResult.handoffReason ?? "Lead requested human"}\n` +
        `Admin: https://mulletsandmortgages.com/admin/leads/${lead.id}`
    );
  }

  // Return empty TwiML — we sent the reply manually via Twilio API
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

// ─── Main route handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Twilio webhooks come as application/x-www-form-urlencoded
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return await handleTwilioWebhook(req);
    }

    // JSON body — action-based modes
    const body = await req.json();
    const { action, lead_id } = body as { action?: string; lead_id?: string };

    // manual_send and trigger require admin auth
    if (action === "manual_send" || action === "trigger") {
      const adminKey = process.env.ADMIN_PASSWORD;
      if (adminKey && req.headers.get("X-Admin-Key") !== adminKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (action === "trigger") {
      if (!lead_id) {
        return NextResponse.json(
          { error: "lead_id is required for trigger action" },
          { status: 400 }
        );
      }
      return await handleTrigger(lead_id);
    }

    if (action === "send_scheduled") {
      return await handleSendScheduled();
    }

    // Manual send from admin dashboard (Zach composing directly)
    if (action === "manual_send") {
      if (!lead_id || !body.message) {
        return NextResponse.json(
          { error: "lead_id and message are required for manual_send" },
          { status: 400 }
        );
      }
      const lead = await db.leads.getById(lead_id);
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      if (lead.sms_opted_out) {
        return NextResponse.json({ error: "Lead has opted out of SMS" }, { status: 400 });
      }
      if (!lead.phone) {
        return NextResponse.json({ error: 'Lead has no phone number' }, { status: 400 });
      }
      const sid = await sendSms(lead.phone, body.message);
      await db.conversations.insert({
        lead_id,
        channel: "sms",
        direction: "outbound",
        body: body.message,
        ai_generated: false,
        metadata: { twilio_sid: sid, source: "admin_dashboard" },
      });
      await db.leads.update(lead_id, {
        last_contacted_at: new Date().toISOString(),
        last_contact_channel: "sms",
        contact_count: (lead.contact_count ?? 0) + 1,
      });
      return NextResponse.json({ ok: true, sid });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'trigger', 'send_scheduled', 'manual_send', or send a Twilio webhook." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[POST /api/agent/sms]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

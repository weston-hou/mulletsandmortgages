# Build Notes — SMS AI Agent System

**Date:** 2026-05-18  
**Status:** ✅ Compiles clean (`npm run build` — 0 errors, 0 warnings)

---

## What Was Built

### `supabase/experiments_migration.sql`
A/B experiment support. Run AFTER `schema.sql`:
- New `experiments` table: `name`, `active`, `variant_a`, `variant_b` (JSONB with `channel_order`, `script_id`, `timing_min`, `timing_max`), `traffic_split`
- `leads` table: added `experiment_id`, `variant` (`a`/`b`), `sms_opted_out`, `sms_opted_out_at`
- `followup_schedule` table: added `script_id`, `experiment_id`, `variant`
- Seeds a default experiment: `text_first_vs_call_first` (50/50 split, `intro_v1` vs `intro_v2`)

### `lib/scripts.ts`
All conversation scripts as typed objects.
- `ScriptConfig` interface: `id`, `name`, `intro` (template), `prequal_prompts[]`, `escalate_to_call`, `handoff_to_zach`, `stage_messages`, `stop_ack`
- `PrequalFields` interface: the 6 fields collected during pre-qual
- `intro_v1` — warm, emoji-light, question-based opener
- `intro_v2` — direct, benefit-forward opener
- Both scripts collect: `full_name`, `prequal_zip`, `prequal_employment`, `prequal_income`, `prequal_liabilities`, `prequal_credit_score`
- Stage messages for: `shopping`, `under_contract`, `underwriting`, `closing`
- `getScript(id)` registry + `fillTemplate(template, vars)` utility

### `lib/claude-agent.ts`
Claude `claude-3-5-sonnet-20241022` conversation engine via direct `fetch()` to `api.anthropic.com` — no SDK dependency.
- `generateAgentReply()` — main export. Takes lead, conversation history, new message, script config, collected fields. Returns `{ reply, extractedFields, shouldEscalateToCall, shouldHandoffToZach, handoffReason }`
- `generateIntroMessage()` — fills template vars for the first outbound message
- System prompt includes: lead context, already-collected fields, missing fields in order, tone rules, TCPA compliance note, escalation triggers, JSON response contract
- Graceful fallback on API failure — hands off to Zach instead of dropping conversation
- JSON extraction handles markdown code block wrapping

### `lib/supabase.ts` (updated)
Added types and db helpers:
- `Experiment` interface
- `FollowupSchedule` interface (with A/B fields)
- `Lead` interface updated with `experiment_id`, `variant`, `sms_opted_out`, `sms_opted_out_at`
- `db.experiments.getActive()` — fetches the active experiment
- `db.followupSchedule.insert()`, `markSent()`, `getDue()` helpers

### `app/api/agent/sms/route.ts` (REPLACED stub with full implementation)
Three modes:

**Mode 1 — `action: "trigger"`** (called when new lead created):
- Loads lead, checks opt-out
- Assigns experiment variant (random, based on traffic_split)
- Calculates send delay: 4–9 min within business hours (8am–7pm America/Phoenix, Mon–Fri), or next business day 8am + 2–9 min offset
- Avoids exact :00/:30 send times
- Inserts into `followup_schedule`
- Returns `{ scheduled, send_at, script_id, variant }`

**Mode 2 — `action: "send_scheduled"`** (called by cron every minute):
- Queries `followup_schedule` for due items (`scheduled_at <= now()`, `sent=false`, `cancelled=false`)
- Generates intro or stage-check-in message per script config
- Sends via Twilio REST API (`fetch()` — no SDK)
- Saves outbound to `conversations`, updates `lead.last_contacted_at`, marks schedule item sent

**Mode 3 — Twilio webhook** (inbound SMS, `Content-Type: application/x-www-form-urlencoded`):
- Parses `From`, `Body`, `MessageSid` from Twilio form body
- Looks up lead by phone number
- STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → sets `sms_opted_out=true`, sends ack, returns empty TwiML
- Saves inbound message to `conversations`
- Loads full conversation history
- Calls `generateAgentReply()` from `claude-agent.ts`
- Sends Claude's reply via Twilio
- Saves outbound reply to `conversations`
- Updates lead with any newly extracted pre-qual fields
- Checks if all 6 fields now collected → sets `prequal_complete=true`, notifies Zach via SMS
- Checks `shouldHandoffToZach` → sends Zach notification with admin link
- Returns empty TwiML (reply already sent via API)

### `app/api/cron/sms/route.ts`
Vercel Cron endpoint:
- `GET /api/cron/sms` — protected by `CRON_SECRET` env var (Bearer token check)
- Calls `/api/agent/sms` with `action: "send_scheduled"`
- Returns `{ ok, sent, errors, timestamp }`

### `vercel.json` (updated)
Added cron entry:
```json
{
  "crons": [{ "path": "/api/cron/sms", "schedule": "* * * * *" }]
}
```

### `app/page.tsx` (updated)
Two changes:
1. After successful lead POST, fires SMS trigger: `POST /api/agent/sms { action: "trigger", lead_id }`  — fire-and-forget, non-blocking
2. Consent language updated to TCPA-compliant copy:
   > "By submitting, you agree to be contacted by Zach Boyko (BrokerBoyko LLC) regarding your mortgage inquiry, including via automated text messages and AI-generated voice calls. Reply STOP to opt out. Msg & data rates may apply."

---

## Required Environment Variables

```
# Existing
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_PASSWORD=your-secure-admin-password

# New — SMS AI Agent
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx    # Twilio number leads receive texts from (E.164)
ZACH_PHONE=+1xxxxxxxxxx             # Zach's personal number for handoff notifications (E.164)
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=random-secure-string    # Protects /api/cron/sms endpoint
NEXT_PUBLIC_BASE_URL=https://mulletsandmortgages.com  # Used by cron to call SMS agent internally
```

---

## Deployment checklist

1. **Run migrations** — execute `supabase/experiments_migration.sql` against the Supabase project (PostgREST REST API auto-reflects new columns)
2. **Add env vars** above in Vercel Dashboard → Project Settings → Environment Variables
3. **Configure Twilio webhook** — in Twilio Console, set the SMS webhook URL for your Twilio number to `https://mulletsandmortgages.com/api/agent/sms` (HTTP POST)
4. **Verify cron** — Vercel Cron runs `GET /api/cron/sms` every minute. Check Vercel Dashboard → Deployments → Functions for execution logs

---

## Follow-up Items

1. **Script_id lookup from lead variant** — the inbound webhook currently uses `intro_v1` as fallback. Should persist `script_id` on the lead record when the experiment is assigned in the trigger, and read it back in the webhook handler for consistency.
2. **Voice escalation** — `shouldEscalateToCall` flag is detected but not yet wired to Vapi.ai to initiate a voice call. Next step.
3. **Re-opt-in (START keyword)** — Twilio handles `START` natively to re-enable messages, but `sms_opted_out` flag in DB won't be cleared automatically. Add a webhook handler for `START` keyword.
4. **Rate limiting** — no per-lead daily message cap yet. Add a check in `handleTwilioWebhook` to limit outbound messages to N per lead per 24h.
5. **A/B result tracking** — `variant` and `experiment_id` are stored on leads. Add a reporting view or dashboard panel to compare pre-qual completion rates across variants.

---

# Build Notes — Admin Dashboard & API Routes

**Date:** 2026-05-18  
**Status:** ✅ Compiles clean (`npm run build` — 0 errors, 0 warnings)

---

## What Was Built

### `lib/supabase.ts`
Server-side Supabase REST client using native `fetch()` — no `@supabase/supabase-js` dependency required (it wasn't installed). Exports:
- Full TypeScript types: `Lead`, `Conversation`, `ContentClip`, `LeadStage`
- `db.leads` — `insert`, `getById`, `list`, `update`
- `db.conversations` — `forLead`, `insert`
- `db.contentClips` — `list`

All reads use `cache: "no-store"` (always fresh in dashboard context).

### `app/api/leads/route.ts`
- **POST** `/api/leads` — inserts a new lead. Accepts all landing page form fields + UTM context from `getTrackingContext()`. Returns `{ id, success }`. No auth required (public endpoint for landing page).
- **GET** `/api/leads` — paginated lead list. Requires `X-Admin-Key` header matching `ADMIN_PASSWORD`. Supports `?stage=`, `?source=`, `?sort=`, `?order=`, `?page=`, `?limit=` query params.

### `app/api/leads/[id]/route.ts`
- **GET** `/api/leads/:id` — returns single lead + full conversation history. Admin only.
- **PATCH** `/api/leads/:id` — updates allowlisted fields: `stage`, `zach_notes`, prequal fields. Admin only. Auto-stamps `prequal_completed_at` when `prequal_complete: true` is set.

### `app/api/content-clips/route.ts`
- **GET** `/api/content-clips` — returns all `content_clips` rows. Admin only.

### `app/api/agent/sms/route.ts`
- **POST** `/api/agent/sms` — **stub** endpoint. Logs the request, returns `{ success: true, stub: true }`.  
  ⚠️ **Needs real implementation** with Twilio / Vapi.ai once those credentials are configured.

### `app/admin/page.tsx` — Main Dashboard
Password-protected with cookie `admin_session`. Login form validates against `GET /api/leads` with the entered key. Once authenticated shows:

1. **Stats bar (4 cards):** Total leads, New this week, Pre-qual complete %, Top converting source
2. **Pipeline Kanban:** Horizontal scrolling, one column per stage (`new → closed`). Each card shows name, phone, loan purpose, estimated price, days since created, source badge (color-coded per platform), pre-qual checkmark.
3. **Leads table:** Sortable by `first_name` and `created_at`. Filterable by stage and source. Columns: Name, Phone, Loan Purpose, Price Range, Credit, State, Stage, Source, Created, Actions (Text/Call/View buttons).
4. **Content performance section:** Clips table with campaign slug, platform, views, clicks, leads generated, CVR, AI suggestions. Shows empty state when no clips.

### `app/admin/leads/[id]/page.tsx` — Lead Detail
- Full lead contact info + loan scenario summary
- Editable fields: stage dropdown + Zach's notes textarea + Save button
- Pre-qual checklist (6 items with ✓ / ○ indicators)
- Conversation timeline (iMessage-style: outbound = amber right, inbound = zinc left)
- Quick SMS compose box (POST to `/api/agent/sms`) with ⌘+Enter shortcut
- AI agent summary panel (shows `agent_notes` when populated)

### `app/page.tsx` — Updated handleSubmit
Replaced the fake `setTimeout(1000)` delay with a real `POST /api/leads` call. Includes all form fields + UTM context from `getTrackingContext()`. Non-fatal — if Supabase is not configured, the user still gets redirected to `/rates`.

---

## Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   (service role key, not anon key!)
ADMIN_PASSWORD=your-secure-admin-password
```

Set in Vercel dashboard → Project Settings → Environment Variables.

---

## Follow-up Items

1. **Supabase keys** — Get `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase project dashboard. Run `supabase/schema.sql` to create the tables if not done already.

2. **SMS integration** — `/api/agent/sms` is a stub. Needs Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) and actual send logic. Consider adding Vapi.ai for voice call triggering.

3. **Row Level Security** — Schema has RLS enabled but no policies set. The service role key bypasses RLS, so this is fine for server-side API routes, but if any client-side Supabase calls are added later, policies will need to be defined.

4. **Admin session security** — Cookie-based auth with plaintext password is simple but adequate for a single-user admin tool. For team access, consider upgrading to NextAuth or Clerk.

5. **Real-time updates** — Dashboard currently requires manual refresh. Could add polling or Supabase Realtime for live lead notifications.

6. **Content clips ingestion** — The `content_clips` table needs a worker/cron to pull data from PostHog + social platforms. Currently empty state shows in dashboard.

7. **Pre-qual letter generation** — `prequal_letter_url` field is in schema but PDF generation not wired up. Placeholder for when Optimal Blue API credentials arrive.

8. **Call button** — Currently a disabled placeholder. Needs Vapi.ai integration to initiate AI voice calls.

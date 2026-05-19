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

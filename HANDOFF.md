# mulletsandmortgages.com — Development Handoff

**Last updated:** May 31, 2026  
**Repository:** https://github.com/weston-hou/mulletsandmortgages  
**Production:** https://mulletsandmortgages.com (auto-deploys from `main` via Vercel)

---

## Stack Overview

**Frontend**
- Next.js 16.2.6 (App Router, React Server Components)
- React 18
- TypeScript (strict mode)
- Tailwind CSS
- Dark theme (zinc palette, amber accents)

**Backend**
- Next.js API routes (Node.js serverless on Vercel)
- Supabase (hosted Postgres)
- Resend (transactional email)
- Twilio (SMS)
- Optimal Blue QuickQuote API (mortgage rates)
- Segment.io (analytics)

**Deployment**
- Vercel (auto-deploy on push to `main`)
- Domain: `mulletsandmortgages.com`
- Build command: `npm run build`
- Node version: 20.x

---

## Environment Variables

Required for local development. **None are in the repo** — you'll need to create `.env.local`:

```bash
# Supabase (database)
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # service_role key (backend only)
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co  # public anon key

# Resend (email)
RESEND_API_KEY=re_...

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+16029055579

# Optional: Segment.io (analytics)
NEXT_PUBLIC_SEGMENT_WRITE_KEY=...
```

**Where to get these:**
- **Supabase**: Project settings → API → URL + service_role key (keep secret) + anon key (public)
- **Resend**: Dashboard → API Keys → Create
- **Twilio**: Console → Account SID + Auth Token + Phone Number
- **Segment**: Workspace settings → API Keys → Write key

---

## Database Schema (Supabase)

### `leads` table
Primary storage for all borrower leads.

**Key columns:**
- `id` (uuid, primary key)
- `first_name`, `last_name`, `email`, `phone` (nullable as of May 2026)
- `loan_purpose`, `estimated_price`, `credit_score`, `state`, `zip`, `property_type`, `down_payment`, `veteran_status`
- `stage` (enum: new | contacted | qualified | closed | lost)
- `preferred_contact` (enum: email | sms | voice)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (tracking)
- `prequal_complete` (boolean), `prequal_letter_url` (text)
- `prequal_income`, `prequal_credit_score`, `prequal_zip`, `prequal_employment`, `prequal_full_name`
- `last_contacted_at`, `created_at`, `updated_at`

**Migration history:**
- `001_initial_schema.sql` — base schema
- `002_nullable_phone.sql` — changed `phone` from NOT NULL to nullable (May 2026)

### `conversations` table
Stores all communication history (email, SMS, agent logs).

**Key columns:**
- `id` (uuid, primary key)
- `lead_id` (uuid, foreign key → leads.id)
- `channel` (enum: email | sms | voice | system)
- `direction` (enum: inbound | outbound)
- `body` (text) — message content or HTML
- `metadata` (jsonb) — structured data (e.g. `{ type: "prequal_letter" }`)
- `created_at`

### `content_clips` table
Stores pre-written email/SMS templates.

**Key columns:**
- `id` (uuid, primary key)
- `name` (text, unique)
- `channel` (enum: email | sms)
- `body` (text) — template with `{{placeholders}}`
- `created_at`

### `experiments` table
A/B test tracking (not actively used yet).

---

## Core Workflows

### 1. Landing Page → Rates Quote Email

**User path:**
1. Visit `mulletsandmortgages.com`
2. Fill form: name, email, phone, loan purpose, exact price, exact down payment, credit score, state, zip, property type, veteran status (Yes/No)
3. Submit → redirects to `/rates?quoted=1&email=...`

**Behind the scenes:**
1. `POST /api/leads` with `utm_source: "rates_quote"` → creates lead in Supabase
2. Fire-and-forget `POST /api/rates/quote` → calls Optimal Blue QuickQuote API, applies 2-point buydown (−0.50%), picks best rate in each category (VA 30, Conforming 15, FHA 30, ARM), builds email with dark cards, sends via Resend
3. `/rates` page shows banner: "Your personalized rates are on their way — check [email]"

**Email content:**
- Personal note from Zach
- 4 rate cards (dark design, "2 pts applied" label, monthly P&I, APR)
- Two CTAs: "Get Pre-Qualified →" (pre-filled apply link) + "Start Full Application" (LendingPad direct link)

**Key files:**
- `/app/page.tsx` — landing page form
- `/app/api/leads/route.ts` — lead persistence
- `/app/api/rates/quote/route.ts` — QuickQuote email trigger
- `/lib/rates-email.ts` — dark card email template

---

### 2. Pre-Qualification Flow

**User path:**
1. Click "Get Pre-Qualified →" from rates email
2. Lands on `/apply` with form pre-filled: name, email, home price, down payment, credit score, veteran status, `requestedLoanAmount` (calculated as price − down payment)
3. Step 3: employment status, annual income, monthly debts (car loan, student loan, current mortgage, other)
4. Submit → DTI engine runs

**Behind the scenes:**
1. `POST /api/leads` (upsert lead with income/debt data)
2. `POST /api/prequal` → runs `runPrequalEngine()` (max 45% DTI, 7.5% stress rate, 30yr fixed)
   - **Approved**: generates pre-qual letter HTML, stores in `conversations` table with `metadata.type = "prequal_letter"`, emails link to borrower
   - **Declined**: sends empathetic decline email, notifies Zach
3. Letter hosted at `/prequal/letter/[lead_id]`

**DTI Math:**
```
maxHousingPayment = (grossMonthlyIncome × 0.45) − existingMonthlyDebts
maxLoanAmount = maxHousingPayment × (1 − (1 + r)^−360) / r
  where r = 7.5% annual / 12
```

**Key files:**
- `/app/apply/page.tsx` — multi-step pre-qual form
- `/app/api/prequal/route.ts` — DTI engine + letter generator
- `/lib/prequal-engine.ts` — DTI math
- `/lib/documents.ts` — pre-qual letter HTML template
- `/app/prequal/letter/[id]/page.tsx` — letter viewer (SSR)

---

### 3. Email Agent (Follow-Up Sequence)

**Trigger:** Cron job (`/api/cron/email/route.ts`, runs every minute on Vercel)

**Logic:**
1. Query Supabase for leads:
   - `preferred_contact = "email"`
   - `last_contacted_at IS NULL`
   - `stage = "new"`
   - `utm_source != "rates_quote"` ← **skip leads who got rates email**
2. For each lead: call `/api/agent/email` with `action: "trigger"` → sends conversational intro email as Zach

**Content:** Uses `lib/claude-email-agent.ts` to generate personalized email based on lead's loan purpose, price range, credit score

**Key files:**
- `/app/api/cron/email/route.ts` — cron orchestrator
- `/app/api/agent/email/route.ts` — email agent logic
- `/lib/claude-email-agent.ts` — email template generator

---

### 4. Rates Display Page (Legacy MND Fallback)

**User path:** `/rates?purpose=...&price=...&credit=...` (query params from landing page)

**Behind the scenes:**
- `GET /api/rates` → scrapes Mortgage News Daily for benchmark rates, applies credit/purpose adjustments, returns 4 cards
- **This is separate from the QuickQuote email** — it's a fallback display for users who land on `/rates` directly

**Key files:**
- `/app/rates/page.tsx` — rates display page
- `/app/api/rates/route.ts` — MND scraper + adjuster

---

## Recent Fixes (May 2026)

### Duplicate Emails Issue
**Problem:** Landing page submissions received two emails — rates quote + generic conversational outreach  
**Root cause:** `/api/leads` was triggering `/api/agent/email` even when `utm_source=rates_quote` was set, because `getTrackingContext()` was overwriting the hardcoded value  
**Fix:** Removed `/api/agent/email` trigger from `/api/leads` entirely (commit `9fe7088`)

### Phone NOT NULL Error
**Problem:** `/apply` page pre-qual submission failed when phone was empty (Supabase NOT NULL constraint)  
**Fix:** Migration `002_nullable_phone.sql` made `phone` column nullable; updated all `lead.phone` references to handle `null` with `?? undefined` (commits `9a6ce1e`, `d820c8e`, `54e09f7`)

### Pre-Qual Letter 404
**Problem:** `/prequal/letter/[lead_id]` was loading `id: "undefined"` instead of the UUID  
**Root cause:** Next.js 16 made `params` async — must be awaited before accessing `params.id`  
**Fix:** Changed `params: { id: string }` to `params: Promise<{ id: string }>` and `const { id } = await params` (commit `863914d`)

### Server Component onClick Error
**Problem:** Pre-qual letter print button threw "Event handlers cannot be passed to Client Component props"  
**Root cause:** `onClick` in a server component (Next.js App Router restriction)  
**Fix:** Extracted `PrintButton` to a separate `"use client"` component (commit `43cc952`)

---

## Optimal Blue QuickQuote API

**Endpoint:** `https://mlo.optimalblue.com/ob/api/QuickQuote/post` (POST, public, no auth)

**Credentials:**
- ClientId: `3833383837`
- UserId: `34363030363031`
- FormId: `33333431`

**Request body:**
```json
{
  "ClientId": "3833383837",
  "UserId": "34363030363031",
  "FormId": "33333431",
  "LoanPurpose": "Purchase",  // or "Refinance"
  "PropertyValue": 450000,
  "LoanAmount": 360000,
  "PropertyState": "AZ",
  "PropertyZip": "85001",
  "PropertyType": "SingleFamily",  // or "Condo", "Townhouse", "MultiFamily"
  "CreditScore": 760,
  "VeteranStatus": "None"  // or "Veteran", "ActiveDuty", "ReserveNationalGuard"
}
```

**Response:** Array of rate objects with `LoanProgram`, `Rate`, `Apr`, `MonthlyPayment`, `ClosingCosts`

**2-Point Buydown Logic:**
- Subtract 0.50% from `Rate` (e.g. 7.25% → 6.75%)
- Recalculate `MonthlyPayment` with new rate
- Original `Apr` unchanged (represents true cost)

---

## Supabase Credentials

**Where to get them:**
1. Go to https://supabase.com/dashboard/project/[your-project-id]
2. Settings → API
3. Copy:
   - **Project URL** → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret, backend only)
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, frontend safe)

**Run migrations:**
```bash
cd supabase
npx supabase migration up
```

---

## Local Development Setup

### 1. Clone the repo
```bash
git clone https://github.com/weston-hou/mulletsandmortgages.git
cd mulletsandmortgages
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create `.env.local`
Copy the template above and fill in your credentials.

### 4. Run Supabase migrations
```bash
cd supabase
npx supabase migration up
cd ..
```

### 5. Start dev server
```bash
npm run dev
```

Open http://localhost:3000

### 6. Type-check before pushing
```bash
npx tsc --noEmit
```

---

## Deployment Notes

**Vercel auto-deploys** on every push to `main`. No manual steps required.

**Build checks:**
- TypeScript: `tsc --noEmit` must pass clean
- Next.js build: `npm run build` must succeed

**Common build errors:**
- Phone nullable type mismatches (`string | null` vs `string | undefined`) — use `?? undefined`
- Next.js 16 async params — must await `params` before accessing `.id`
- Server component event handlers — extract to `"use client"` components

---

## File Structure

```
mulletsandmortgages/
├── app/
│   ├── page.tsx                      # Landing page form
│   ├── rates/page.tsx                # Rates display (MND fallback)
│   ├── apply/page.tsx                # Pre-qual flow
│   ├── prequal/letter/[id]/page.tsx  # Pre-qual letter viewer
│   ├── admin/                        # Admin dashboard (not public)
│   └── api/
│       ├── leads/route.ts            # Lead persistence
│       ├── rates/route.ts            # MND scraper
│       ├── rates/quote/route.ts      # QuickQuote email trigger
│       ├── prequal/route.ts          # DTI engine + letter generator
│       ├── agent/
│       │   ├── email/route.ts        # Email agent
│       │   └── sms/route.ts          # SMS agent
│       └── cron/
│           └── email/route.ts        # Email cron orchestrator
├── lib/
│   ├── supabase.ts                   # Supabase client + helpers
│   ├── email.ts                      # Resend wrapper
│   ├── rates-email.ts                # Dark card email template
│   ├── prequal-engine.ts             # DTI math
│   ├── documents.ts                  # Pre-qual letter HTML
│   ├── claude-email-agent.ts         # Email template generator
│   └── analytics.ts                  # Segment.io helpers
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_nullable_phone.sql
├── HANDOFF.md                        # This file
└── package.json
```

---

## Common Tasks

**Add a new migration:**
```bash
cd supabase/migrations
# Create NNNN_description.sql
# Write SQL
cd ../..
npx supabase migration up  # apply locally
git add supabase/migrations/NNNN_description.sql
git commit -m "migration: description"
git push  # auto-applies on Vercel deploy
```

**Update email template:**
- Edit `lib/rates-email.ts` (rates quote) or `lib/claude-email-agent.ts` (conversational)
- Test locally: submit form → check email
- Push to `main` → live in ~2 min

**Add a new rate adjustment:**
- Edit `app/api/rates/route.ts` (MND scraper adjustments)
- Or edit `app/api/rates/quote/route.ts` (QuickQuote adjustments)

**Change DTI logic:**
- Edit `lib/prequal-engine.ts`
- Restart dev server

---

## Troubleshooting

**Build fails with "invalid input syntax for type uuid"**
→ Next.js 16 async params issue. Await `params` before accessing `.id`.

**Build fails with "string | null is not assignable to string"**
→ Phone nullable type mismatch. Use `phone ?? undefined`.

**Build fails with "Event handlers cannot be passed to Client Component props"**
→ Extract component with `onClick` to a separate `"use client"` file.

**Email not sending**
→ Check Resend API key in `.env.local`. Check Resend dashboard for delivery status.

**Rates email shows wrong rates**
→ Check Optimal Blue request body in `/api/rates/quote/route.ts`. Log the response to see what you're getting back.

**Pre-qual letter 404**
→ Check lead exists in Supabase with `prequal_complete = true`. Check `conversations` table for a row with `metadata.type = "prequal_letter"` and matching `lead_id`.

---

## Contact

**Owner:** Zachary Boyko (Broker Boyko LLC / Laser Fast Closing)  
**NMLS:** #2004025  
**Phone:** +1 (602) 905-5579  
**Email:** zach@mulletsandmortgages.com  
**Licensed in:** AZ, ID, MT, NV, OR, UT, WA, WY

---

## Next Steps / Roadmap

### Immediate (This Week)
- [x] ~~Rates quote email flow (QuickQuote API + 2pt buydown)~~
- [x] ~~Pre-qual link pre-fill with `requestedLoanAmount`~~
- [x] ~~Fix phone nullable (Supabase migration)~~
- [x] ~~Skip duplicate email for `utm_source=rates_quote` leads~~
- [x] ~~Fix pre-qual letter 404~~
- [x] ~~Clarify rates page shows market estimates~~

### Near-Term (Next Week)
- **follow-up-agent**: Hire sub-agent to monitor Supabase leads, send first-touch email within 1 hour, run 3–5 day nurture sequence, surface hot leads to Zach
- **Admin panel improvements**: Dashboard to view leads, manually trigger pre-qual, see conversations

### Mid-Term (Next Month)
- **SMS agent**: Twilio integration for text-based follow-up (+16029055579, business hours Mon–Sat 8am–8pm MST)
- **Rate alerts**: Email borrowers when rates drop below their quoted rate
- **Full app integration**: Deep-link into LendingPad with pre-filled data
- **A/B testing**: Experiment with email copy, CTAs, rate display

---

**End of handoff. Questions? Check the code or ask Zach.**

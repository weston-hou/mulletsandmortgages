# Integrated e2e (staging tier)

Runs against a **real staging deployment** with sandboxed services. It's the only
tier that exercises the real submit → real Resend send → hosted-letter journey end
to end (vs. the mocked tests in `../e2e`).

**Option A (no capture inbox):** the test triggers a real email send and asserts
Resend accepts it (a 200 from `/api/prequal`), then follows the deterministic
`/prequal/letter/{lead_id}` link and confirms the hosted letter renders from the
real database. Proving the link is *inside* the email body is handled separately
and fast by the unit test in `app/api/prequal/route.test.ts`.

The test **self-skips** when `STAGING_BASE_URL` is absent, so it's safe to leave
wired into CI before the infra exists.

## What you need to provide

1. **A staging deploy** of the app — a dedicated Vercel project (or a stable
   preview) pointed at a **test Supabase project** and a **Resend** key. Never
   point these at production data.
2. (Optional) `STAGING_ADMIN_KEY` so the test can delete the lead it creates.

No email account, IMAP, or third-party inbox is needed for Option A.

## Env / config

| Name | Kind | Purpose |
|------|------|---------|
| `STAGING_BASE_URL` | secret | base URL of the staging deploy |
| `STAGING_ADMIN_KEY` | secret | staging `ADMIN_PASSWORD`, for cleanup (optional) |
| `STAGING_ENABLED` | repo **variable** | set to `true` to turn the CI job on |

## Run locally

```bash
STAGING_BASE_URL=https://staging.example.com npm run test:staging
```

## CI

`.github/workflows/staging.yml` runs this on every push to `main` (and on demand),
**gated on the repo variable `STAGING_ENABLED == 'true'`** so it stays dormant —
no wasted CI minutes — until you flip it on and add the secrets.

> Note: on a push it assumes staging has finished deploying by the time `npm ci` +
> browser install complete (~1–2 min, longer than a Vercel deploy). If your staging
> deploy is slower, switch the trigger to that deploy's `deployment_status` event
> (the way `smoke.yml` gates on the production deploy).

## Why no inbox?

You're testing *your* link, not the email provider's deliverability. The letter URL
is deterministic, so following it directly proves the hosted letter works; Tier 1
already proves the link is embedded in the email. Reading the delivered email (via
IMAP or a service like Mailosaur) only adds verification of the email *template* as
sent — a narrow gap you can close later if you want it.

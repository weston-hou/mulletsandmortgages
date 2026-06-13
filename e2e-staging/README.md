# Integrated e2e (staging tier)

These tests run against a **real staging deployment** with sandboxed services. They
are the only tier that proves the genuine "submit → real email → click link → see
letter" journey end to end (vs. the mocked tests in `../e2e`).

They **self-skip** when the required env vars are absent, so they're safe to leave
wired into CI before the infra exists.

## What you need to provide

1. **A staging deploy** of the app (e.g. a dedicated Vercel project or a stable
   preview URL) pointed at a **test Supabase project** and a **Resend** key. Never
   point these at production data.
2. **A capture inbox** — [Mailosaur](https://mailosaur.com) (free tier works). Create
   a server; note its **API key** and **server id**. Its inbox domain is
   `<serverId>.mailosaur.net`, and the test sends to a unique address there so the
   real Resend email lands in a place we can read via API — no human inbox involved.
3. (Optional) `STAGING_ADMIN_KEY` so the test can clean up the lead it creates.

## Env vars

| Var | Purpose |
|-----|---------|
| `STAGING_BASE_URL` | base URL of the staging deploy |
| `MAILOSAUR_API_KEY` | Mailosaur API key |
| `MAILOSAUR_SERVER_ID` | Mailosaur server id (its inbox domain) |
| `STAGING_ADMIN_KEY` | staging `ADMIN_PASSWORD`, for test-lead cleanup (optional) |

## Run

```bash
STAGING_BASE_URL=https://staging.example.com \
MAILOSAUR_API_KEY=... MAILOSAUR_SERVER_ID=... \
npm run test:staging
```

In CI, set these as repository **secrets** — the `.github/workflows/staging.yml`
nightly job picks them up (and the tests skip cleanly if they're unset).

## Why a capture inbox instead of a real inbox?

You're testing *your* link, not the email provider's deliverability. The letter URL
is deterministic (`/prequal/letter/{lead_id}`); the capture inbox just lets the test
read the real email your system sent and confirm the link in it actually renders.
True deliverability/spam testing is a separate concern handled by Resend itself.

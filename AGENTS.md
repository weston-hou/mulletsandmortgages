<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

These are established patterns in this repo. Preserve them; don't refactor away from them without a reason.

## No third-party SDKs — use `fetch()`

Every external service (Supabase, Resend, Twilio, Anthropic, Google Drive/Docs/Sheets, Optimal Blue) is accessed with plain `fetch()` against its REST API. The **only** runtime dependencies are `next`, `react`, and `react-dom` — there are no vendor SDK packages installed. Do not `npm install @supabase/supabase-js`, `@anthropic-ai/sdk`, `twilio`, `googleapis`, etc. Add new integrations as a thin `fetch()` wrapper in `lib/`, matching the existing files (`lib/email.ts`, `lib/supabase.ts`, `lib/claude-agent.ts`, `lib/google-drive.ts`, …). This keeps the app portable and free of vendor lock-in.

## Configuration

- All runtime env vars are documented in `.env.example` (kept in sync with what the code actually reads). When you add or remove a `process.env.*` reference, update `.env.example` in the same change.
- **Exception:** the Optimal Blue QuickQuote credentials (`ClientId`/`UserId`/`FormId`) are hardcoded constants in `app/api/rates/quote/route.ts`, not env vars.

## Patterns

- Email/SMS triggers from API routes are fire-and-forget (the route doesn't block on delivery). See the landing form path: `app/page.tsx` → `app/api/leads/route.ts` + `app/api/rates/quote/route.ts`.
- Protected API routes and `/admin` gate on `ADMIN_PASSWORD` (cookie); cron/agent routes gate on a `CRON_SECRET` bearer token.

## Testing

- **Unit/integration** (Vitest, jsdom): `npm test` (watch: `npm run test:watch`,
  coverage: `npm run test:coverage`). Specs are `*.test.ts(x)` colocated with the
  code. Route-handler tests mock `@/lib/*` with `vi.hoisted` + `vi.mock`.
- **E2E** (Playwright, mocked APIs via `page.route`): `npm run test:e2e`. Specs
  live in `e2e/*.spec.ts`. Run `npx playwright install chromium` once first.
- **Post-deploy smoke** (read-only, against a live URL): `npm run test:smoke`
  (`e2e-smoke/*.smoke.ts`). `.github/workflows/smoke.yml` runs it after deploys.
- **Integrated/staging** (real services + capture inbox, the genuine
  email→click→letter test): `npm run test:staging` (`e2e-staging/`, see its
  README). Self-skips without the staging/Mailosaur env vars.
- Test files are excluded from the production `tsconfig.json`; typecheck them with
  `tsc -p tsconfig.test.json --noEmit`. CI (`.github/workflows/test.yml`) runs
  lint + both typechecks + unit + e2e on every push/PR to `main`.

See `HANDOFF.md` for the full architecture, data model, and feature walkthrough.

# Content Pipeline — Setup Guide (Option A)

## What this does
You record and **edit one master video**, drop it in a Google Drive folder, and the
pipeline does the rest:

```
edited video → Google Drive folder → Vizard cuts viral clips → top clips
auto-publish to your connected socials → Vizard captions them → you get a text + a Sheets log
```

This is the "one edited video in, many platform posts out" flow. It does NOT
assemble multi-camera footage — feed it a single finished video. (See the repo
discussion / HANDOFF for the multi-cam options.)

> **Heads-up:** the original `workflow.json` was built against an incorrect guess
> of the Vizard API and would not run. It has been rebuilt against the real
> Vizard open-api (`https://elb-api.vizard.ai/hvizard-server-front/open-api/v1`).
> If you'd rather start from a vendor-maintained workflow, Vizard publishes an
> official n8n template you can import and compare against:
> https://n8n.io/workflows/12054

---

## Prerequisites / blockers (do these first)

These are the real-world accounts the pipeline needs. Until they exist, it can't run.

- [ ] **Social accounts** created on each target platform (TikTok, YouTube,
      Instagram/Facebook, LinkedIn, Twitter/X).
- [ ] **Vizard** account on a plan that includes API access + social publishing.
- [ ] Social accounts **connected inside Vizard** (Settings → Connected Accounts).
- [ ] **Google Drive** folder for raw uploads, shared "anyone with the link can view".
- [ ] **Twilio** number + Account SID + Auth Token (for the "content is live" text).
- [ ] **Zach's phone number** in E.164 format (e.g. `+16025550123`).

---

## Step 1 — Vizard

1. Sign up at [vizard.ai](https://vizard.ai) on a plan with **API access** and **social publishing**.
2. **Settings → Connected Accounts** → connect every platform you want to post to.
3. **Settings → API → Generate API Key** → copy it.

---

## Step 2 — n8n

1. Use [app.n8n.cloud](https://app.n8n.cloud) (or self-hosted n8n).
2. **Workflows → Import from File** → upload `workflow.json` from this folder.
3. Create the credentials the workflow references:

   **Vizard API** — credential type **Header Auth** (HTTP Header Auth):
   - **Name:** `VIZARDAI_API_KEY`
   - **Value:** your raw API key  ← *no `Bearer ` prefix*
   - (The old setup said `Authorization: Bearer …` — that is wrong for Vizard.)

   **Google Drive** — OAuth2, via n8n's Google sign-in flow.

   **Google Sheets** — same Google account as Drive.

   **Twilio** — credential type **Basic Auth**:
   - **User:** Twilio Account SID
   - **Password:** Twilio Auth Token

4. Assign each credential to its node (n8n flags any node still missing one).

---

## Step 3 — Google Drive folder

1. Create a folder (e.g. `Uploads/Raw`) in the Google account you connected.
2. Share it so **anyone with the link can view** — Vizard downloads the file via
   a public Drive link, so this is required.
3. Copy the folder ID from the URL
   (`drive.google.com/drive/folders/THIS_PART`).
4. Open the **Google Drive — New Video** node → set **Folder to Watch** to that ID.

---

## Step 4 — Google Sheet (content log)

1. Create a Sheet, e.g. `M&M Content Log`.
2. Add a tab named exactly `Content Log` with header columns:
   `Timestamp`, `Total Published`, `Total Failed`, `Platform Links`.
3. Copy the Sheet ID from its URL → paste into the **Log to Google Sheets** node.

---

## Step 5 — Twilio (SMS to Zach)

In the **SMS Zach — Content Live** node, replace:
- `REPLACE_TWILIO_ACCOUNT_SID` (in the URL) — your Account SID
- `REPLACE_TWILIO_PHONE_NUMBER` — your Twilio number (E.164)
- `REPLACE_ZACH_PHONE_E164` — Zach's number (E.164)

(The SID also lives in the Basic Auth credential from Step 2.)

---

## Step 6 — Tune behavior (optional)

In the **Build Publish Tasks** node:
- `MAX_CLIPS` — how many top-scoring clips to post per video (default 5).
- Edit the `caption` string for your default post copy.
- Platform targeting: by default each selected clip posts to **every connected
  active account**. To restrict, uncomment the `.filter(a => [...].includes(a.platform))`
  line and list the platforms you want.

In the **Vizard — Create Project** node `jsonBody`:
- `preferLength: [1,2,3,4]` — clip length buckets (1=<30s, 2=30–60s, 3=60–90s,
  4=90s–3min). Use `[0]` for fully automatic (cannot mix `0` with others).
- `maxClipNumber: 10` — how many clips Vizard generates before you down-select.
- `ratioOfClip: 1` — clip shape: **1 = vertical 9:16** (TikTok/Reels/Shorts),
  2 = square 1:1, 4 = widescreen 16:9. One ratio per run; default is vertical.

To **schedule** instead of posting immediately, add `publishTime` (unix seconds)
to the publish `jsonBody` in **Vizard — Publish Video**.

---

## Step 6b — Branding (logo / banner on every clip) — optional but recommended

This replaces what the old Creatomate path did (the amber lower-third), but done
inside Vizard so it also captions and publishes.

1. In Vizard, build a **Brand Kit** (logo, brand color `#f59e0b`, fonts) and a
   **template** — Settings → Brand Kit / Templates. The template's aspect ratio
   **must match `ratioOfClip`** (vertical template ↔ `ratioOfClip: 1`).
2. Copy the numeric **template ID**.
3. In the **Vizard — Create Project** node `jsonBody`, replace the placeholder
   `REPLACE_WITH_VIZARD_TEMPLATE_ID` with that ID.

Until you do this, the pipeline still runs — it just uses Vizard's default styling
(no custom branding). The create-node expression omits `templateId` while the
placeholder is in place, so leaving it unset does not break anything.

---

## Step 7 — Test, then activate

1. With the workflow open, **drop one short test video** in the Drive folder and
   use **Execute Workflow** to watch it run node-by-node. Confirm:
   - Create returns a `projectId`
   - Query eventually returns `code: 2000` with a `videos` array
   - Get Social Accounts returns your connected accounts (`status: "active"`)
   - Publish returns `code: 2000` per post
2. Flip the workflow to **Active**. From then on: drop an edited video → ~5–10 min
   later it's clipped, posted, and you get a text.

---

## UTM links (track which video drove leads)

After a video posts, generate trackable bio/caption links:

```bash
node generate-utm-links.js "jun_mortgage_tips"
```

Each platform gets a unique link so leads are attributed to the exact video in PostHog.

---

## How the pipeline maps to the Vizard API (reference)

All calls use header `VIZARDAI_API_KEY: <key>` against
`https://elb-api.vizard.ai/hvizard-server-front/open-api/v1`.

| Node | Call |
|------|------|
| Vizard — Create Project | `POST /project/create` → returns `projectId` |
| Vizard — Query Clips | `GET /project/query/{projectId}` → `code` 1000=processing, 2000=ready, `videos[]` |
| Vizard — Get Social Accounts | `GET /project/social-accounts` → `publishAccounts[]` (`id`, `platform`, `status`) |
| Vizard — Publish Video | `POST /project/publish-video` (one `finalVideoId` → one `socialAccountId`) → `code` 2000=ok |

Note: publish is **one clip to one account per call**, so the workflow fans out
`MAX_CLIPS × connected accounts` publish requests.

---

## Still pending elsewhere (not needed for Option A)
- [ ] Optimal Blue / Loansifter credentials — for **live website rates**, unrelated
      to this content pipeline.

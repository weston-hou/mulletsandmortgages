# Content Pipeline — Setup Guide

## What this does
Zach drops a raw video in Google Drive → Vizard AI cuts it into viral clips → auto-posts to all 5 social platforms → Zach gets a text with links.

---

## Step 1 — Vizard.ai

1. Sign up at [vizard.ai](https://vizard.ai) → upgrade to **Creator** plan
2. Go to **Settings → Connected Accounts** and connect all social accounts:
   - YouTube (Google login)
   - TikTok (business account)
   - Instagram / Facebook (Meta login)
   - LinkedIn (company page)
   - Twitter/X
3. Go to **Settings → API** → copy your API key (stored in vault as `team.vizard`)

---

## Step 2 — n8n Cloud

1. Sign up at [app.n8n.cloud](https://app.n8n.cloud) → free trial
2. Go to **Settings → API Keys** → Create new key (stored in vault as `team.n8n`)
3. Import the workflow:
   - In n8n → **Workflows → Import from file**
   - Upload `workflow.json` from this folder
4. Create credentials in n8n:
   - **Vizard API** (HTTP Header Auth): Header = `Authorization`, Value = `Bearer YOUR_VIZARD_KEY`
   - **Google Drive**: OAuth2 — follow n8n's Google Drive OAuth flow
   - **Google Sheets**: same OAuth account as Drive
   - **Twilio**: HTTP Basic Auth — Account SID as username, Auth Token as password

---

## Step 3 — Google Drive folder

1. Create a folder called `Uploads/Raw` in Zach's Google Drive
2. Share it so anyone with the link can view (needed for Vizard to download the video)
3. Copy the folder ID from the URL: `drive.google.com/drive/folders/FOLDER_ID_HERE`
4. Paste it into the workflow node: **Google Drive — New Video → Folder to Watch**

---

## Step 4 — Google Sheet (content log)

1. Create a new Google Sheet called `M&M Content Log`
2. Add a tab called `Content Log` with columns: `Timestamp`, `Total Published`, `Total Failed`, `Platform Links`
3. Copy the Sheet ID from the URL and paste into the **Log to Google Sheets** node

---

## Step 5 — Twilio (SMS to Zach)

1. Sign up at [twilio.com](https://twilio.com) → get a phone number (~$1.15/mo)
2. Copy Account SID, Auth Token, and phone number
3. Fill in the **SMS Zach** node:
   - `REPLACE_TWILIO_ACCOUNT_SID`
   - `REPLACE_TWILIO_PHONE_NUMBER`
   - `REPLACE_ZACH_PHONE_E164` → Zach's number in format `+16025550123`

---

## Step 6 — Activate

Flip the workflow to **Active** in n8n. From that point:

1. Zach records a video
2. Drops it in the `Uploads/Raw` Google Drive folder
3. ~5-10 min later: clips are cut, posted to all platforms, Zach gets a text

---

## UTM Link Generator

After each video posts, generate trackable links for Zach's bios/captions:

```bash
node generate-utm-links.js "jan_mortgage_tips"
```

Outputs unique links per platform with a timestamp. Every lead from that post is tagged to that exact video in PostHog.

---

## What's pending (waiting on Zach)
- [ ] Social accounts created on all 5 platforms
- [ ] Vizard social accounts connected
- [ ] TikTok & LinkedIn API approvals (only needed if bypassing Vizard's native publish)
- [ ] Zach's phone number for SMS notifications
- [ ] Optimal Blue / Loansifter credentials (for live rates on website)

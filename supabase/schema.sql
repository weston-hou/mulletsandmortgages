-- ============================================================
-- Mullets & Mortgages — Supabase Schema
-- ============================================================

-- LEADS TABLE
-- Core lead record. Created when form is submitted on landing page.
CREATE TABLE IF NOT EXISTS leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contact
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT,
  phone            TEXT NOT NULL,

  -- Loan scenario (from landing page form)
  loan_purpose     TEXT,           -- "Purchase a home", "Refinance", etc.
  estimated_price  TEXT,           -- "$400k – $600k"
  credit_score     TEXT,           -- "720 – 759"
  state            TEXT,
  zip              TEXT,
  property_type    TEXT,
  down_payment     TEXT,

  -- Pre-qual fields (collected by AI agent)
  prequal_zip              TEXT,   -- subject property zip (may differ from lead zip)
  prequal_employment       TEXT,   -- employment history (verbal summary)
  prequal_income           TEXT,   -- annual income
  prequal_liabilities      TEXT,   -- auto loans, credit cards, medical debt summary
  prequal_credit_score     TEXT,   -- confirmed credit score range
  prequal_full_name        TEXT,   -- legal full name

  -- Pre-qual status
  prequal_complete         BOOLEAN DEFAULT false,
  prequal_letter_url       TEXT,   -- link to generated PDF
  prequal_completed_at     TIMESTAMPTZ,

  -- Pipeline stage
  stage TEXT NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','contacted','pre_qual','shopping','under_contract','underwriting','closing','closed','dead')),

  -- Attribution (UTM + content analytics)
  utm_source       TEXT,           -- tiktok, youtube, linkedin, etc.
  utm_medium       TEXT,           -- video, reel, short
  utm_campaign     TEXT,           -- clip slug
  utm_content      TEXT,           -- short, medium, teaser
  clicked_at       BIGINT,         -- unix timestamp when social post was clicked
  landed_at        BIGINT,         -- unix timestamp when page loaded
  referrer         TEXT,
  posthog_id       TEXT,           -- PostHog distinct_id for cross-referencing

  -- Agent interaction tracking
  last_contacted_at    TIMESTAMPTZ,
  last_contact_channel TEXT,       -- 'sms', 'voice', 'email'
  contact_count        INT DEFAULT 0,
  next_followup_at     TIMESTAMPTZ,
  agent_notes          TEXT,       -- running AI-generated summary of conversations

  -- Zach's notes
  zach_notes           TEXT,
  assigned_to          TEXT DEFAULT 'zach',
  preferred_contact    TEXT DEFAULT 'email' CHECK (preferred_contact IN ('email','sms','voice'))
);

-- CONVERSATIONS TABLE
-- Every inbound/outbound SMS or voice interaction, stored for AI analysis
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('sms','voice','email')),
  direction    TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body         TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT false,
  metadata     JSONB DEFAULT '{}'::jsonb  -- twilio SID, call duration, etc.
);

-- CONTENT ANALYTICS TABLE
-- Stores per-clip performance data pulled from PostHog + Vizard
-- Used for AI analysis to improve future content
CREATE TABLE IF NOT EXISTS content_clips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign_slug   TEXT NOT NULL,       -- utm_campaign value
  platform        TEXT NOT NULL,       -- tiktok, youtube, linkedin, etc.
  format          TEXT,                -- short, medium, teaser
  posted_at       TIMESTAMPTZ,
  vizard_clip_id  TEXT,

  -- Performance (updated periodically from PostHog/platform APIs)
  views           INT DEFAULT 0,
  clicks          INT DEFAULT 0,       -- clicks to mulletsandmortgages.com
  leads_generated INT DEFAULT 0,       -- leads with this utm_campaign
  conversion_rate NUMERIC(5,4),        -- leads / clicks

  -- AI content analysis
  transcript      TEXT,                -- Whisper transcription of clip
  ai_topics       TEXT[],              -- extracted topics: ["rates","first-time buyer","VA loans"]
  ai_tone         TEXT,                -- "educational", "motivational", "story"
  ai_hook         TEXT,                -- first 3 seconds description
  ai_suggestions  TEXT,                -- AI-generated improvement suggestions

  -- Audience insights (aggregate from leads with this campaign)
  avg_loan_range  TEXT,
  top_states      TEXT[],
  top_purposes    TEXT[]
);

-- FOLLOWUP_SCHEDULE TABLE
-- Scheduled outreach queue for the SMS/voice agents
CREATE TABLE IF NOT EXISTS followup_schedule (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('sms','voice')),
  stage        TEXT NOT NULL,
  message_hint TEXT,      -- context for the AI on what to say
  sent         BOOLEAN DEFAULT false,
  sent_at      TIMESTAMPTZ,
  cancelled    BOOLEAN DEFAULT false
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_leads_stage        ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_created_at   ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source   ON leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_phone        ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_scheduled ON followup_schedule(scheduled_at) WHERE sent = false AND cancelled = false;
CREATE INDEX IF NOT EXISTS idx_content_campaign   ON content_clips(campaign_slug, platform);

-- AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ROW LEVEL SECURITY (enable before going to prod)
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_clips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_schedule  ENABLE ROW LEVEL SECURITY;

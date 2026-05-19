-- ============================================================
-- Migration 001: Add columns added after initial schema
-- Safe to run multiple times (all use IF NOT EXISTS / DO blocks)
-- ============================================================

-- leads: SMS opt-out
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out      BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out_at   TIMESTAMPTZ;

-- leads: A/B experiment assignment
ALTER TABLE leads ADD COLUMN IF NOT EXISTS experiment_id       TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS variant             TEXT;  -- 'a' or 'b'

-- leads: document eSignatures
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_to_contact_signed_at  TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_to_contact_sign_ip    TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS loan_disclosure_signed_at     TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS loan_disclosure_sign_ip       TEXT;

-- followup_schedule: script + experiment tracking
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS script_id      TEXT;
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS experiment_id  TEXT;
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS variant        TEXT;
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS sent_at        TIMESTAMPTZ;

-- experiments table (A/B testing)
CREATE TABLE IF NOT EXISTS experiments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  name           TEXT NOT NULL,
  active         BOOLEAN DEFAULT true,
  traffic_split  NUMERIC(3,2) DEFAULT 0.5,  -- 0.5 = 50/50
  variant_a      JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_b      JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at     TIMESTAMPTZ DEFAULT now(),
  ended_at       TIMESTAMPTZ
);

-- Only one active experiment at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_experiments_active
  ON experiments(active) WHERE active = true;

-- Index for signature status (admin filters)
CREATE INDEX IF NOT EXISTS idx_leads_consent_signed
  ON leads(consent_to_contact_signed_at) WHERE consent_to_contact_signed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_disclosure_signed
  ON leads(loan_disclosure_signed_at) WHERE loan_disclosure_signed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_sms_opted_out
  ON leads(sms_opted_out) WHERE sms_opted_out = true;

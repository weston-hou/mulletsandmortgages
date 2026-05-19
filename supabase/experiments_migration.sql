-- ============================================================
-- Mullets & Mortgages — A/B Experiments Migration
-- Run AFTER the base schema.sql
-- ============================================================

-- A/B experiment configs
CREATE TABLE IF NOT EXISTS experiments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  name         TEXT NOT NULL,
  active       BOOLEAN DEFAULT true,
  variant_a    JSONB NOT NULL,  -- { channel_order, script_id, timing_min, timing_max }
  variant_b    JSONB NOT NULL,
  traffic_split NUMERIC(3,2) DEFAULT 0.50  -- 0.50 = 50/50
);

-- Add experiment tracking to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES experiments(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('a','b'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMPTZ;

-- Add A/B context to followup_schedule
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS script_id TEXT;
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS experiment_id UUID;
ALTER TABLE followup_schedule ADD COLUMN IF NOT EXISTS variant TEXT;

-- Seed default experiment
INSERT INTO experiments (name, active, variant_a, variant_b, traffic_split) VALUES (
  'text_first_vs_call_first',
  true,
  '{"channel_order": ["sms", "voice"], "script_id": "intro_v1", "timing_min": 4, "timing_max": 9}',
  '{"channel_order": ["sms", "voice"], "script_id": "intro_v2", "timing_min": 4, "timing_max": 9}',
  0.50
)
ON CONFLICT DO NOTHING;

-- Index for opt-out lookups
CREATE INDEX IF NOT EXISTS idx_leads_sms_opted_out ON leads(sms_opted_out) WHERE sms_opted_out = true;
CREATE INDEX IF NOT EXISTS idx_experiments_active ON experiments(active) WHERE active = true;

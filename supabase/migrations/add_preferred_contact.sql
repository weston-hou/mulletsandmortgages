-- Add preferred_contact column to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'email'
    CHECK (preferred_contact IN ('email', 'sms', 'voice'));

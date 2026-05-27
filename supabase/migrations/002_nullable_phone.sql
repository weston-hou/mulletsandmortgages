-- Make phone nullable in leads table
-- Required for email-only pre-qual flows where phone is not collected upfront

ALTER TABLE leads
  ALTER COLUMN phone DROP NOT NULL;

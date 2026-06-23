-- Run this in Supabase SQL editor
-- Adds KYC fields to profiles table

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dob         text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aadhaar     text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locality    text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_code  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_code    text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city        text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_complete boolean DEFAULT false;

-- Also needed: acknowledgement_no on returns
ALTER TABLE returns ADD COLUMN IF NOT EXISTS acknowledgement_no text;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS filed_at      timestamptz;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS filed_by      uuid;

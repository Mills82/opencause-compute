ALTER TABLE volunteer_profiles
  ADD COLUMN IF NOT EXISTS setup_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS setup_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_volunteer_profiles_setup_token_hash
  ON volunteer_profiles(setup_token_hash)
  WHERE setup_token_hash IS NOT NULL;

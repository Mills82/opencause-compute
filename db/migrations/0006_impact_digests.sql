CREATE TABLE IF NOT EXISTS impact_digests (
  id UUID PRIMARY KEY,
  volunteer_profile_id UUID NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sections_processed INTEGER NOT NULL DEFAULT 0,
  format_validated_submissions INTEGER NOT NULL DEFAULT 0,
  consensus_passed_contributions INTEGER NOT NULL DEFAULT 0,
  idle_minutes_donated INTEGER NOT NULL DEFAULT 0,
  badges_awarded INTEGER NOT NULL DEFAULT 0,
  team_rank INTEGER,
  preview_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE(volunteer_profile_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_impact_digests_profile_period
  ON impact_digests(volunteer_profile_id, period_start DESC);

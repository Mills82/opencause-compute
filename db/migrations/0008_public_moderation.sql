ALTER TABLE volunteer_profiles
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'ok' CHECK (moderation_status IN ('ok', 'hidden', 'flagged')),
  ADD COLUMN IF NOT EXISTS moderation_note TEXT;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'ok' CHECK (moderation_status IN ('ok', 'hidden', 'flagged')),
  ADD COLUMN IF NOT EXISTS moderation_note TEXT;

ALTER TABLE impact_cards
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'ok' CHECK (moderation_status IN ('ok', 'hidden', 'flagged')),
  ADD COLUMN IF NOT EXISTS moderation_note TEXT;

CREATE TABLE IF NOT EXISTS public_reports (
  id UUID PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('volunteer_profile', 'team', 'impact_card')),
  target_id UUID,
  target_slug TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  reporter_contact TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_public_reports_status_created ON public_reports(status, created_at DESC);

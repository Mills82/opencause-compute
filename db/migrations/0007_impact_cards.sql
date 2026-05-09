CREATE TABLE IF NOT EXISTS impact_cards (
  id UUID PRIMARY KEY,
  volunteer_profile_id UUID REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL CHECK (card_type IN ('volunteer_weekly', 'team_weekly', 'global')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  metric_value TEXT NOT NULL,
  accent_color TEXT NOT NULL DEFAULT '#38bdf8',
  public_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impact_cards_profile ON impact_cards(volunteer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impact_cards_team ON impact_cards(team_id, created_at DESC);

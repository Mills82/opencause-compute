CREATE TABLE IF NOT EXISTS volunteer_profiles (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  privacy_mode TEXT NOT NULL DEFAULT 'private' CHECK (privacy_mode IN ('private', 'public_anonymous', 'public_named')),
  public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_color TEXT NOT NULL DEFAULT '#38bdf8',
  bio TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  stats_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volunteer_profile_nodes (
  id UUID PRIMARY KEY,
  volunteer_profile_id UUID NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES volunteer_nodes(id) ON DELETE CASCADE,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detached_at TIMESTAMPTZ,
  UNIQUE(node_id, detached_at)
);
CREATE INDEX IF NOT EXISTS idx_volunteer_profile_nodes_profile ON volunteer_profile_nodes(volunteer_profile_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_profile_nodes_node ON volunteer_profile_nodes(node_id);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_by_volunteer_profile_id UUID REFERENCES volunteer_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stats_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  volunteer_profile_id UUID NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'captain')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(team_id, volunteer_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_team_memberships_profile ON team_memberships(volunteer_profile_id);

CREATE TABLE IF NOT EXISTS badge_definitions (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  criteria_kind TEXT NOT NULL,
  criteria_value INTEGER NOT NULL DEFAULT 0,
  icon_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volunteer_badges (
  id UUID PRIMARY KEY,
  volunteer_profile_id UUID NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_kind TEXT,
  source_id TEXT,
  UNIQUE(volunteer_profile_id, badge_slug)
);
CREATE INDEX IF NOT EXISTS idx_volunteer_badges_profile ON volunteer_badges(volunteer_profile_id);

CREATE TABLE IF NOT EXISTS volunteer_stats_snapshots (
  id UUID PRIMARY KEY,
  volunteer_profile_id UUID NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  stats_window TEXT NOT NULL CHECK (stats_window IN ('all_time', 'weekly', 'monthly')),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  contribution_score INTEGER NOT NULL DEFAULT 0,
  sections_processed INTEGER NOT NULL DEFAULT 0,
  packets_submitted INTEGER NOT NULL DEFAULT 0,
  format_validated_submissions INTEGER NOT NULL DEFAULT 0,
  format_rejected_submissions INTEGER NOT NULL DEFAULT 0,
  consensus_passed_contributions INTEGER NOT NULL DEFAULT 0,
  consensus_failed_contributions INTEGER NOT NULL DEFAULT 0,
  human_reviewed_accepted_contributions INTEGER NOT NULL DEFAULT 0,
  idle_minutes_donated INTEGER NOT NULL DEFAULT 0,
  distinct_active_days INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  badges_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(volunteer_profile_id, stats_window, window_start, window_end)
);
CREATE INDEX IF NOT EXISTS idx_volunteer_stats_leaderboard ON volunteer_stats_snapshots(stats_window, contribution_score DESC);

CREATE TABLE IF NOT EXISTS team_stats_snapshots (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stats_window TEXT NOT NULL CHECK (stats_window IN ('all_time', 'weekly', 'monthly')),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  contribution_score INTEGER NOT NULL DEFAULT 0,
  sections_processed INTEGER NOT NULL DEFAULT 0,
  packets_submitted INTEGER NOT NULL DEFAULT 0,
  format_validated_submissions INTEGER NOT NULL DEFAULT 0,
  format_rejected_submissions INTEGER NOT NULL DEFAULT 0,
  consensus_passed_contributions INTEGER NOT NULL DEFAULT 0,
  consensus_failed_contributions INTEGER NOT NULL DEFAULT 0,
  human_reviewed_accepted_contributions INTEGER NOT NULL DEFAULT 0,
  idle_minutes_donated INTEGER NOT NULL DEFAULT 0,
  distinct_active_days INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  active_member_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, stats_window, window_start, window_end)
);
CREATE INDEX IF NOT EXISTS idx_team_stats_leaderboard ON team_stats_snapshots(stats_window, contribution_score DESC);

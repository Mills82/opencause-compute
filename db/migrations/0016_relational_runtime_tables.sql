-- Runtime tables required by relational coordinator APIs from an empty database.

CREATE TABLE IF NOT EXISTS worker_control (
  id INTEGER PRIMARY KEY,
  paused BOOLEAN NOT NULL DEFAULT false,
  idle_mode TEXT NOT NULL DEFAULT 'user-and-cpu',
  min_idle_seconds INTEGER NOT NULL DEFAULT 120,
  max_cpu_percent INTEGER NOT NULL DEFAULT 35,
  run_now_token INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO worker_control(id, paused, idle_mode, min_idle_seconds, max_cpu_percent, run_now_token, updated_at)
VALUES (1, false, 'user-and-cpu', 120, 35, 0, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY,
  source_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  query TEXT NOT NULL,
  retmax INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  failure_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  packets_created INTEGER NOT NULL DEFAULT 0,
  packets_skipped INTEGER NOT NULL DEFAULT 0,
  used_ncbi_email BOOLEAN NOT NULL DEFAULT false,
  used_ncbi_api_key BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ingestion_runs_started_idx ON ingestion_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx ON ingestion_runs(status, started_at DESC);

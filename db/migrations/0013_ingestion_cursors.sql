CREATE TABLE IF NOT EXISTS ingestion_cursors (
  id UUID PRIMARY KEY,
  source_type TEXT NOT NULL,
  query TEXT NOT NULL,
  next_retstart INTEGER NOT NULL DEFAULT 0,
  last_retmax INTEGER NOT NULL DEFAULT 0,
  last_records_fetched INTEGER NOT NULL DEFAULT 0,
  last_run_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ingestion_cursors_source_query_idx ON ingestion_cursors(source_type, query);

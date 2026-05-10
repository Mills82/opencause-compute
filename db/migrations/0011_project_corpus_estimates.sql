CREATE TABLE IF NOT EXISTS project_corpus_estimates (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  corpus_source TEXT NOT NULL,
  query TEXT NOT NULL,
  eligible_document_count INTEGER NOT NULL,
  ingested_document_count INTEGER NOT NULL,
  packets_created_from_ingested_documents INTEGER NOT NULL,
  average_packets_per_document NUMERIC NOT NULL,
  estimated_total_packets INTEGER NOT NULL,
  estimate_method TEXT NOT NULL,
  refresh_status TEXT NOT NULL,
  failure_reason TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_corpus_estimates_project_source_query_idx
  ON project_corpus_estimates(project_id, corpus_source, query);
CREATE INDEX IF NOT EXISTS project_corpus_estimates_project_refreshed_idx
  ON project_corpus_estimates(project_id, refreshed_at DESC);

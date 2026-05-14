-- OpenCause Compute relational foundation.
-- Safe to apply alongside the current opencause_state JSONB table.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS work_packets (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  source_citation TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published_at TEXT,
  input_hash TEXT NOT NULL,
  extractor TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS work_packets_project_input_extractor_idx
  ON work_packets(project_id, input_hash, extractor);
CREATE INDEX IF NOT EXISTS work_packets_status_created_idx
  ON work_packets(status, created_at);
CREATE INDEX IF NOT EXISTS work_packets_project_status_idx
  ON work_packets(project_id, status);

CREATE TABLE IF NOT EXISTS volunteer_nodes (
  id UUID PRIMARY KEY,
  node_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  registered_at TIMESTAMPTZ NOT NULL,
  last_heartbeat_at TIMESTAMPTZ,
  node_token_hash TEXT,
  enrollment_code_hash TEXT,
  suspended_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS volunteer_nodes_status_heartbeat_idx
  ON volunteer_nodes(status, last_heartbeat_at);
CREATE INDEX IF NOT EXISTS volunteer_nodes_enrollment_code_hash_idx
  ON volunteer_nodes(enrollment_code_hash);

CREATE TABLE IF NOT EXISTS work_claims (
  id UUID PRIMARY KEY,
  work_packet_id UUID NOT NULL REFERENCES work_packets(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES volunteer_nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS work_claims_node_status_idx
  ON work_claims(node_id, status);
CREATE INDEX IF NOT EXISTS work_claims_status_lease_idx
  ON work_claims(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS work_claims_packet_status_idx
  ON work_claims(work_packet_id, status);

CREATE TABLE IF NOT EXISTS extraction_results (
  id UUID PRIMARY KEY,
  work_packet_id UUID NOT NULL REFERENCES work_packets(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES volunteer_nodes(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES work_claims(id) ON DELETE CASCADE,
  extractor_version TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  validated BOOLEAN NOT NULL,
  format_validated BOOLEAN NOT NULL,
  consensus_status TEXT NOT NULL,
  review_status TEXT NOT NULL,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  provenance JSONB
);

CREATE INDEX IF NOT EXISTS extraction_results_packet_submitted_idx
  ON extraction_results(work_packet_id, submitted_at);
CREATE INDEX IF NOT EXISTS extraction_results_node_submitted_idx
  ON extraction_results(node_id, submitted_at);
CREATE INDEX IF NOT EXISTS extraction_results_validation_idx
  ON extraction_results(format_validated, consensus_status, review_status);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events(action, created_at DESC);

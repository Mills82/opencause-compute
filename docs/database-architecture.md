# Database architecture plan

OpenCause Compute currently uses a single `opencause_state` JSONB row in Postgres, with a file fallback for local development. That is acceptable for private alpha only. Public launch needs relational tables, indexes, and transactional queue operations.

## Goals

- Keep local file fallback for development.
- Move hosted production to normalized Postgres tables.
- Make claim/submit flow safe with concurrent workers.
- Avoid loading the full app state for queue operations and result browsing.
- Preserve source citations, validation state, provenance, and auditability.

## Target tables

### `projects`

- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `description text not null`
- `status text not null`
- `created_at timestamptz not null`

### `work_packets`

- `id uuid primary key`
- `project_id uuid not null references projects(id)`
- `title text not null`
- `source_text text not null`
- `source_citation text not null`
- `source_url text not null`
- `source_published_at text`
- `input_hash text not null`
- `extractor text not null`
- `signature text not null`
- `status text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes:

- `(status, created_at)` for queued work selection
- `(project_id, status)` for project views
- unique `(project_id, input_hash, extractor)` for dedupe

### `volunteer_nodes`

- `id uuid primary key`
- `node_name text not null`
- `platform text not null`
- `version text not null`
- `status text not null`
- `capabilities jsonb not null`
- `registered_at timestamptz not null`
- `last_heartbeat_at timestamptz`
- `node_token_hash text`
- `enrollment_code_hash text`
- `suspended_at timestamptz`
- `revoked_at timestamptz`

Indexes:

- `(status, last_heartbeat_at)` for online/offline reconciliation
- `(enrollment_code_hash)` for enrollment audit/debugging

### `work_claims`

- `id uuid primary key`
- `work_packet_id uuid not null references work_packets(id)`
- `node_id uuid not null references volunteer_nodes(id)`
- `status text not null`
- `claimed_at timestamptz not null`
- `lease_expires_at timestamptz not null`
- `completed_at timestamptz`

Indexes:

- `(node_id, status)` for active claim lookup
- `(status, lease_expires_at)` for expiry reconciliation
- `(work_packet_id, status)` for packet claim state

### `extraction_results`

- `id uuid primary key`
- `work_packet_id uuid not null references work_packets(id)`
- `node_id uuid not null references volunteer_nodes(id)`
- `claim_id uuid not null references work_claims(id)`
- `extractor_version text not null`
- `result_hash text not null`
- `validated boolean not null`
- `format_validated boolean not null`
- `consensus_status text not null`
- `review_status text not null`
- `validation_errors jsonb not null`
- `warnings jsonb not null`
- `summary text not null`
- `submitted_at timestamptz not null`
- `provenance jsonb`

Indexes:

- `(work_packet_id, submitted_at)`
- `(node_id, submitted_at)`
- `(format_validated, consensus_status, review_status)`

### `extracted_claims`

- `id uuid primary key`
- `result_id uuid not null references extraction_results(id)`
- `cancer_type text`
- `gene_or_biomarker text`
- `drug_or_compound text`
- `relationship_type text not null`
- `evidence_sentence text not null`
- `confidence numeric not null`
- `source_citation text not null`
- `source_url text not null`

Indexes:

- `(relationship_type)`
- `(cancer_type)`
- `(gene_or_biomarker)`
- `(drug_or_compound)`
- `(source_url)`

### `worker_control`

Single-row table:

- `id integer primary key default 1`
- `paused boolean not null`
- `idle_mode text not null`
- `min_idle_seconds integer not null`
- `max_cpu_percent numeric not null`
- `run_now_token integer not null`
- `updated_at timestamptz not null`

### `ingestion_runs`

- `id uuid primary key`
- `source_type text not null`
- `mode text not null`
- `status text not null`
- `query text not null`
- `retmax integer not null`
- `started_at timestamptz not null`
- `completed_at timestamptz`
- `fetched_count integer not null`
- `skipped_count integer not null`
- `failed_count integer not null`
- `failure_reasons jsonb not null`
- `packets_created integer not null`
- `packets_skipped integer not null`
- `used_ncbi_email boolean not null`
- `used_ncbi_api_key boolean not null`

Indexes:

- `(started_at desc)`
- `(status, started_at desc)`
- `(source_type, started_at desc)`

### `audit_events`

- `id uuid primary key`
- `actor_type text not null` — admin, cron, node, system
- `actor_id text`
- `action text not null`
- `target_type text`
- `target_id text`
- `metadata jsonb not null`
- `created_at timestamptz not null`

Indexes:

- `(created_at desc)`
- `(actor_type, actor_id, created_at desc)`
- `(target_type, target_id, created_at desc)`
- `(action, created_at desc)`

## Claim transaction target

Use a single Postgres transaction:

1. Reclaim expired claims.
2. If node already has an active claim, return it.
3. Select one queued packet with `FOR UPDATE SKIP LOCKED`.
4. Insert claim.
5. Mark packet claimed.
6. Commit.

This avoids two workers receiving the same packet under load.

## Submit transaction target

Use a single Postgres transaction:

1. Validate node status/token before entering mutation path.
2. Lock claim row and packet row.
3. Reject expired/completed/wrong-node claims.
4. Validate result schema/evidence.
5. Insert extraction result and candidate evidence records.
6. Mark claim completed.
7. Mark packet completed or ready for consensus depending on validation policy.
8. Commit.

## Migration strategy

1. Add migrations table and SQL migration runner.
2. Create relational tables alongside `opencause_state`.
3. Add export/import helpers from current JSONB state to relational tables.
4. Add read-path feature flag for relational storage in non-prod first.
5. Move claim/submit hot path to relational implementation.
6. Move admin/list APIs.
7. Leave file fallback for local dev only.
8. Remove hosted JSONB dependency after verification.

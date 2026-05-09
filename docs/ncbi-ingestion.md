# NCBI ingestion notes

OpenCause Compute uses NCBI/PubMed/PMC ingestion only for open/public biomedical literature. Ingestion must be conservative and observable.

## Current controls

- E-Utilities requests include `tool` and optional `email`/`api_key` parameters.
- Configure `NCBI_EMAIL`; configure `NCBI_API_KEY` when available.
- Default pacing is conservative:
  - no API key: ~350ms between dependent NCBI requests (under 3 req/s)
  - API key: ~120ms where used (under 10 req/s)
- Transient failures and 429/5xx responses use bounded retry/backoff and honor `Retry-After` when present.
- Ingestion runs record source type, mode, status, query, retmax, fetched/skipped/failed counts, failure reasons, and packet counts.
- PMC OA per-record failures are recorded and do not silently disappear.

## Still needed before large-scale ingestion

- E-Utilities history/WebEnv batching for larger jobs.
- Larger-job pagination with explicit run checkpoints.
- More detailed per-request observability.
- Admin UI for ingestion run details and failure drill-down.
- Tunable global/distributed rate limiting if multiple serverless instances can ingest concurrently.

## Operator guidance

Keep `retmax` low for private alpha. Prefer small, inspectable ingestion runs until consensus/review and operational monitoring are mature.

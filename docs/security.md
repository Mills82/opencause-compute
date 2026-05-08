# Security (V1)

## Current protections

- Work packets are treated as data, not executable code.
- Worker executes only bundled `Mock Extractor v1` logic.
- Server signs packet payloads with HMAC-SHA256.
- Worker verifies packet signatures before extraction.
- Input source text hash recorded on packet creation.
- Result JSON hash recorded on submission.
- Result validation enforces:
  - schema and enum conformance
  - confidence bounds (0..1)
  - evidence sentence inclusion in source text
  - citation/source metadata preservation on extracted facts
- Claim leases are time-limited and expired claims are reclaimed/requeued.
- Duplicate claim attempts from one node are idempotent and do not create concurrent active claims.
- Nodes are marked offline when heartbeat is stale, and offline-node claims are reclaimed.
- Worker uses local app-data directory (`~/.opencause-compute`) and writes visible activity logs.
- No inbound ports or local LLM server are required for worker operation.
- Worker gates packet execution behind idle checks (default: user idle + CPU threshold).

## Known V1 limits

- Symmetric HMAC requires shared secret distribution to worker.
- File DB fallback has no row-level ACLs, no transactional locking, no at-rest encryption.
- Validation does not yet include duplicate-packet consensus adjudication.
- Node trust model is basic; no reputation or anomaly scoring.

## Hardening roadmap (V2+)

- Asymmetric signing (server private key, worker public key verification).
- Worker sandboxing and stronger process isolation.
- Signed model/extractor manifests.
- Hash-verified model/download pipeline.
- Duplicate-result consensus checks for packet completion.
- Bad-node detection and reputation scoring.
- Stricter egress controls.
- Signed auto-update chain.

# Security (V1)

## Current protections

- Work packets are treated as data, not executable code.
- Worker executes only approved built-in extraction paths (`Local LLM v1` by default, mock path by explicit opt-in only).
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
- Worker opens no inbound ports; local LLM runs on localhost and is called outbound by worker.
- Worker gates packet execution behind idle checks (default: user idle + CPU threshold).
- Coordinator-managed worker controls allow pause/resume and run-now testing without changing executable code.
- Release mode rejects mock extractor submissions unless `ALLOW_MOCK_RESULTS=true` is explicitly set.

## Known V1 limits

- Symmetric HMAC requires shared secret distribution to worker.
- File DB fallback has no row-level ACLs or at-rest encryption.
- Postgres state persistence is transactional for coordinator updates but still stores a single JSONB state row in V1.
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


## Private-alpha signing limitation

HMAC is private-alpha-only. Production/hosted mode must set `SIGNING_SECRET`; local dev/test may use the dev fallback. Asymmetric signing is required before public volunteer release, because workers should not receive server signing secrets in the long term.

## Work packet signing

Public-launch packet signing uses Ed25519 asymmetric signatures.

- The coordinator signs canonical work-packet payloads with `PACKET_SIGNING_PRIVATE_KEY`.
- Workers verify with `PACKET_SIGNING_PUBLIC_KEY` and never need the coordinator private key.
- `PACKET_SIGNING_KEY_ID` identifies the active key and supports rotation planning.
- `SIGNING_SECRET`/HMAC remains only as a local-dev or controlled private-alpha fallback. Do not give public workers a shared signing secret.

### Key rotation

1. Generate a new Ed25519 keypair.
2. Deploy the new public key to workers with a new `PACKET_SIGNING_KEY_ID`.
3. Deploy the matching private key to the coordinator.
4. Retire the old key after old in-flight work packets expire.

Forged packets, tampered payloads, key-id mismatches, and signatures made by the wrong private key must fail worker verification.

## Result provenance

Every submitted result should carry enough provenance for later audit without leaking sensitive local details. Current result records support:

- worker version and platform
- extractor version
- model name and runtime/provider, e.g. Ollama
- prompt version and prompt hash
- packet schema version
- extraction timestamp
- local LLM endpoint type only (`localhost`, `remote-http`, or `other`), not the full endpoint URL
- worker capabilities
- result validation version

Coordinator fallback provenance is generated from node metadata if an older worker omits provenance, but public/beta workers should submit the full provenance payload.

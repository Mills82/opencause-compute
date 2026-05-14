# Architecture (V1)

## Monorepo structure

- `apps/web`: Next.js App Router coordinator and dashboard.
- `apps/worker`: CLI worker client.
- `packages/shared`: shared schemas, signing, extraction, validation.

## Coordinator (web app)

- Uses Postgres state storage when `DATABASE_URL` is configured.
- Falls back to file-backed JSON database (`apps/web/data/db.json`) for immediate local usage.
- Exposes coordinator APIs for node lifecycle and packet workflow.
- Seeds Cancer Knowledge Miner project with demo packets.
- Maintains entities:
  - Project
  - WorkPacket
  - VolunteerNode
  - WorkClaim
  - ExtractionResult
  - ExtractedClaim
- Maintains worker control state:
  - paused/resumed status
  - idle mode and thresholds
  - run-now token for one-shot manual execution

## Worker

- CLI commands:
  - `register`
  - `heartbeat`
  - `claim`
  - `run-once`
  - `loop`
- `run-once` flow:
  1. heartbeat
  2. idle gate check (user idle + CPU threshold, configurable)
  3. claim
  4. verify HMAC signature
  5. run Local LLM v1 extraction (default release mode)
  6. submit results
- Writes activity log to `~/.opencause-compute/worker.log`.
- Polls coordinator worker-control config and applies central pause/resume and thresholds.
- Supports one-shot run-now token that bypasses idle gate for manual testing.
- Mock extractor path is disabled by default and kept for explicit development/test opt-in only.

## Shared package

- Zod schemas define packet/result/entity types.
- Deterministic mock extractor with fixed rules.
- HMAC signing verification utilities isolated from app code for future asymmetric migration.
- Validation checks evidence sentence inclusion and schema constraints.

## Data flow

1. Admin seeds project and work packets.
2. Coordinator can ingest PubMed abstracts into signed queued work packets.
3. Node registers and heartbeats.
4. Worker claims a queued packet.
5. Worker verifies packet signature and extracts candidate evidence.
6. Worker submits structured result.
7. Coordinator validates and stores result/evidence records.
8. Dashboard renders state from coordinator DB.

## Claim leasing behavior

- Claims are leased for 10 minutes.
- Heartbeats from a node with an active claim extend that claim lease.
- Coordinator reclaims expired claims during subsequent claim attempts.
- Nodes with no heartbeat for 3 minutes are marked offline.
- Claims held by offline nodes are expired and their packets are requeued.
- Expired claims are marked `expired`, and packets with no active claim are requeued.
- Duplicate claim attempts from the same node return the existing active claim (idempotent claim behavior).

## Local dev fallback

- No Postgres required in V1.
- File DB fallback is default.
- Shared `drizzleStyleSchema` describes intended table model for future SQL implementation.

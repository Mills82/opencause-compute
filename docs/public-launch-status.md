# OpenCause Compute public launch status

Status: **not public-launch ready**.

Current deployment is suitable only for controlled private-alpha/demo exposure with trusted participants.

## Closed or materially reduced

- Public landing page no longer exposes coordinator internals.
- Coordinator/admin pages and read APIs require admin session/auth.
- Hosted packet signing uses Ed25519 private/public key signing.
- Worker enrollment is invite-code gated and hosted registration fails closed.
- Suspended/revoked nodes cannot authenticate, claim, or submit.
- Hosted storage uses relational Postgres tables.
- Worker claim/submit hot path uses targeted SQL and row locks.
- Initial duplicate consensus flow exists for two independent worker submissions.
- Result provenance is recorded.
- Ingestion runs and audit events are tracked.
- Baseline legal/trust pages exist.
- Private-alpha incident response notes exist.

## Still blocking broad public launch

- Desktop installer/tray UX and no-developer-tooling install path.
- Stronger worker sandbox/resource controls.
- Production-grade, distributed rate limiting and abuse monitoring beyond in-process best-effort limits.
- Mature consensus validation: semantic comparison, configurable thresholds, reviewer tooling, consensus exports.
- More complete public legal review and policy copy.
- Real public volunteer account/onboarding flow beyond private-alpha invite codes.
- More robust NCBI batching/history/backoff for larger ingestion jobs.
- Load/concurrency tests against real Postgres for claim/submit/consensus under worker load.

## Current go/no-go

- Private alpha / controlled demo: **go**, with trusted users only.
- Public beta with selected external volunteers: **not yet**; installer, sandbox/resource controls, and stronger abuse controls should land first.
- Broad public launch: **no-go** until every blocker in `docs/public-launch-checklist.md` is closed.

## Abuse-control update

Hosted deployments now use Postgres-backed rate-limit buckets when `DATABASE_URL` is present, with in-memory fallback for local development or if `OPENCAUSE_DB_RATE_LIMITS=false`. This is stronger than pure in-process limits for serverless deployments, but broad public launch should still monitor abuse patterns and consider edge/provider controls for high traffic.

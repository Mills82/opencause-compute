# OpenCause Compute public launch status

Status: **not public-launch ready**.

Current deployment is suitable for controlled private-alpha/demo exposure. A Windows desktop installer prototype exists for selected tester QA, but broad public launch is still blocked.

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
- Windows desktop installer prototype and GitHub Release workflow exist, so selected Windows testers should not need Node/npm.
- Baseline abuse monitoring snapshot exists for admin/operator review.

## Still blocking broad public launch

- Signed desktop installer and clean-machine Windows QA.
- Stronger worker sandbox/resource verification on a packaged build.
- Provider/edge abuse monitoring and configured alert destinations for broader traffic.
- Mature consensus validation: semantic comparison, configurable thresholds, reviewer tooling, consensus exports.
- More complete public legal review and policy copy.
- Hosted public volunteer enrollment must be exercised with Turnstile/email delivery and selected-testers before broad opening.
- More robust NCBI batching/history/backoff for larger ingestion jobs.
- Load/concurrency tests against real Postgres for claim/submit/consensus under worker load.

## Current go/no-go

- Private alpha / controlled demo: **go**, with trusted users only.
- Public beta with selected external volunteers: **close but not automatic**; use the Windows installer prototype only after clean-machine QA and enrollment/download env verification.
- Broad public launch: **no-go** until every blocker in `docs/public-launch-checklist.md` is closed.

## Abuse-control update

Hosted deployments now use Postgres-backed rate-limit buckets when `DATABASE_URL` is present, with in-memory fallback for local development or if `OPENCAUSE_DB_RATE_LIMITS=false`. Admins can review `/api/admin/abuse-monitoring` for enrollment, challenge-failure, registration, claim, submit, validation-failure, and enforcement signals. Broad public launch should still add provider/edge monitoring for high traffic.

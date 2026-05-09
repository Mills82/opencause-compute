# OpenCause Compute public launch checklist

OpenCause Compute is **not public-launch ready** until every Public Launch item below is complete. Private alpha may proceed only with controlled participants and protected coordinator access.

## Stages

- **Private alpha:** public landing page can be visible; coordinator/admin surface is authenticated; workers are trusted/invited manually; hosted packet signing is asymmetric; JSONB state remains acceptable only with documented risk.
- **Public beta:** volunteer enrollment is gated; node revocation/rate limiting/provenance are in place; legal/trust pages exist; abuse controls are tested.
- **Public launch:** asymmetric packet signing, relational storage, consensus validation, installer UX, observability, incident response, and legal/science disclaimers are complete.

## Private-alpha go/no-go

- [x] `/` is public-facing and does not expose coordinator internals.
- [x] `/admin`, `/projects`, `/work-packets`, `/results`, and `/nodes` require admin login.
- [x] Worker-control POST and run-now POST require admin authorization without exposing `ADMIN_API_KEY` in browser code.
- [x] Worker heartbeat/claim/submit still require valid node tokens.
- [x] Hosted env validation is enabled with `OPENCAUSE_HOSTED=true`.
- [x] Required hosted env vars are set: `DATABASE_URL`, `PACKET_SIGNING_PRIVATE_KEY`, `PACKET_SIGNING_PUBLIC_KEY`, `ADMIN_API_KEY`, `NCBI_EMAIL`, and `CRON_SECRET` when cron ingestion is enabled.
- [x] `/api/health` works and exposes no secrets.
- [x] README and private-alpha runbook describe local/dev versus hosted behavior.

## Security checklist

- [x] Replace HMAC packet signing with coordinator private key / worker public key verification for hosted mode.
- [x] Add key rotation documentation and tests for tampering/key mismatch.
- [x] Add invite/enrollment-code flow for node registration.
- [x] Add self-serve one-time volunteer enrollment-code API foundation.
- [x] Add node statuses: active/online, offline, suspended, revoked.
- [x] Revoked or suspended nodes cannot claim or submit.
- [x] Add best-effort configurable rate limits for registration, heartbeat, claim, submit, admin ingest, worker control, and public APIs.
- [x] Add audit logs for admin actions, node registration/revocation, claims, submissions, ingestion, and validation decisions.
- [ ] Add public `/volunteer` form with Turnstile widget and email delivery/verification.
- [x] Add Postgres-backed rate-limit buckets for hosted/serverless-safe abuse control.
- [ ] Add edge/provider abuse monitoring and alerting before broad high-traffic launch.

## Deployment/env checklist

- [x] Add dependency audit triage and document remaining framework upgrade blocker.
- [x] Add admin-gated private-alpha test-state reset path.
- [ ] Resolve or formally accept remaining moderate Next/PostCSS audit findings before broad public launch.
- [x] Add relational database architecture plan and migration scaffolding.
- [x] `.env.example` includes coordinator, worker, hosted, optional ingestion, and rate-limit settings.
- [x] Hosted deployments fail clearly on missing required configuration.
- [x] File DB fallback is local/dev only by default; hosted uses Postgres relational storage unless explicitly disabled.
- [x] Move hosted production from single-row JSONB state to relational tables.
- [ ] Rollback procedure is documented and tested.

## Worker release checklist

- [x] Worker records version, extractor version, model/runtime, prompt version/hash, schema version, validation version, timestamp, and platform capabilities.
- [x] Add desktop app scaffold/contract for public volunteer worker UX.
- [x] Add Windows unsigned prototype artifact workflow.
- [ ] Installer does not require normal volunteers to install Node/npm manually.
- [x] Private-alpha worker has visible activity log, coordinator pause handling, status command, and local-state uninstall command.
- [ ] Public volunteer worker has one-click pause/resume, uninstall, startup-on-login control, resource settings, and version display in desktop UI.
- [ ] Complete Windows release QA checklist in `docs/windows-release-qa-checklist.md`.
- [ ] Implement code signing plan in `docs/code-signing-plan.md`.
- [x] Worker release/sandbox target model is documented in `docs/worker-release-and-sandbox-plan.md`.
- [x] Add approved extractor manifest and localhost/app-dir safety checks.
- [ ] Worker sandbox/resource model is fully implemented and tested for public release.

## Legal/trust checklist

- [x] Add baseline `/privacy`, `/terms`, `/security`, `/science-disclaimer`, and `/responsible-disclosure` pages.
- [x] Explain what data volunteers process and send back.
- [x] Explain local file access boundaries, telemetry, security reporting, electricity/resource implications, open-access literature caveats, and no-medical-advice posture.
- [ ] Add fuller uninstall instructions once installer/desktop UX exists.

## AI/science-risk checklist

- [x] UI uses “candidate facts,” “citation-backed extraction,” and “format/schema validation.”
- [x] UI avoids medical/clinical overclaims.
- [x] Add consensus validation levels and separate raw submissions from consensus facts in labels/docs.
- [x] No extracted fact is labeled accepted solely because one worker produced schema-valid JSON.
- [x] Implement initial duplicate independent processing and structural consensus comparison.
- [ ] Add semantic comparison, configurable thresholds, reviewer tooling, and consensus exports.

## NCBI ingestion checklist

- [x] Include registered email/API key config on NCBI requests.
- [x] Honor conservative request pacing in current ingestion paths.
- [x] Add bounded backoff/retry for transient NCBI failures.
- [ ] Add batching/history for larger jobs.
- [x] Track ingestion runs with fetched/skipped/failed counts, failure reasons, source type, query, retmax, and timestamps.

## Observability and incident checklist

- [x] Admin dashboard shows baseline queue, claim, node, worker-control, and ingestion health without database spelunking.
- [x] Baseline private-alpha incident response path is documented in `docs/incident-response.md`.
- [x] Add baseline structured audit events for admin actions, registration/revocation, claims, submissions, ingestion, and validation decisions in current state model.
- [ ] Move audit events to durable relational `audit_events` table during storage cutover.

## Final go/no-go

Go only when all stage-appropriate boxes are checked, tests pass, hosted deployment is verified, and remaining risks are documented in the launch notes.

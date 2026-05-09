# OpenCause Compute public launch checklist

OpenCause Compute is **not public-launch ready** until every Public Launch item below is complete. Private alpha may proceed only with controlled participants and protected coordinator access.

## Stages

- **Private alpha:** public landing page can be visible; coordinator/admin surface is authenticated; workers are trusted/invited manually; HMAC packet signing and JSONB state are acceptable with documented risk.
- **Public beta:** volunteer enrollment is gated; node revocation/rate limiting/provenance are in place; legal/trust pages exist; abuse controls are tested.
- **Public launch:** asymmetric packet signing, relational storage, consensus validation, installer UX, observability, incident response, and legal/science disclaimers are complete.

## Private-alpha go/no-go

- [ ] `/` is public-facing and does not expose coordinator internals.
- [ ] `/admin`, `/projects`, `/work-packets`, `/results`, and `/nodes` require admin login.
- [ ] Worker-control POST and run-now POST require admin authorization without exposing `ADMIN_API_KEY` in browser code.
- [ ] Worker heartbeat/claim/submit still require valid node tokens.
- [ ] Hosted env validation is enabled with `OPENCAUSE_HOSTED=true`.
- [ ] Required hosted env vars are set: `DATABASE_URL`, `SIGNING_SECRET`, `ADMIN_API_KEY`, `NCBI_EMAIL`, and `CRON_SECRET` when cron ingestion is enabled.
- [ ] `/api/health` works and exposes no secrets.
- [ ] README and private-alpha runbook describe local/dev versus hosted behavior.

## Security checklist

- [ ] Replace HMAC packet signing with coordinator private key / worker public key verification.
- [ ] Add key rotation documentation and tests for tampering/key mismatch.
- [ ] Add invite/account/device approval flow for node registration.
- [ ] Add node statuses: active, suspended, revoked.
- [ ] Revoked or suspended nodes cannot claim or submit.
- [ ] Add rate limits for registration, heartbeat, claim, submit, admin ingest, worker control, and public APIs.
- [ ] Add audit logs for admin actions, node registration/revocation, claims, submissions, ingestion, and validation decisions.

## Deployment/env checklist

- [ ] `.env.example` includes coordinator, worker, hosted, and optional ingestion settings.
- [ ] Hosted deployments fail clearly on missing required configuration.
- [ ] File DB fallback is local/dev only.
- [ ] Rollback procedure is documented and tested.

## Worker release checklist

- [ ] Worker records version, extractor version, model/runtime, prompt version/hash, schema version, validation version, timestamp, and platform capabilities.
- [ ] Installer does not require normal volunteers to install Node/npm manually.
- [ ] Worker has visible activity log, pause/resume, uninstall, startup-on-login control, resource settings, and version display.
- [ ] Worker sandbox/resource model is documented.

## Legal/trust checklist

- [x] Add baseline `/privacy`, `/terms`, `/security`, `/science-disclaimer`, and `/responsible-disclosure` pages.
- [ ] Explain what data volunteers process and send back.
- [ ] Explain local file access boundaries, telemetry, uninstall, security reporting, electricity/resource implications, open-access literature caveats, and no-medical-advice posture.

## AI/science-risk checklist

- [ ] UI uses “candidate facts,” “citation-backed extraction,” and “format/schema validation.”
- [ ] UI avoids medical/clinical overclaims.
- [ ] Add consensus validation levels and separate raw submissions from consensus facts.
- [ ] No extracted fact is labeled accepted solely because one worker produced schema-valid JSON.

## NCBI ingestion checklist

- [ ] Include registered tool/email on NCBI requests.
- [ ] Honor 3 req/s without API key and 10 req/s with API key.
- [ ] Add backoff/retry and batching/history for larger jobs.
- [x] Track ingestion runs with fetched/skipped/failed counts, failure reasons, source type, query, retmax, and timestamps.

## Final go/no-go

Go only when all stage-appropriate boxes are checked, tests pass, hosted deployment is verified, and remaining risks are documented in the launch notes.

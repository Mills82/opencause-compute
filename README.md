# OpenCause Compute

OpenCause Compute lets volunteers contribute spare compute to AI-assisted open science.

The project coordinates small, signed work packets from open/public scientific literature. Volunteer workers verify each packet, run an approved local extraction workflow, and return citation-backed **candidate facts** with provenance for review and consensus.

OpenCause Compute is **not medical advice** and does not make clinical claims. Output is research-support evidence only.

## For volunteers

### Current status

OpenCause Compute is moving from controlled private alpha toward selected public beta.

A Windows desktop worker installer now exists as an unsigned prototype for QA/trusted tester use. Normal volunteers should use the desktop installer path; they do **not** need to install Node.js, npm, Git, or clone this repository.

Broad public launch is still blocked until signing, clean-machine QA, and remaining launch checks are complete. See `docs/public-launch-checklist.md`.

### Install the Windows worker

1. Go to the OpenCause Compute download page:
   - `https://opencause.appassist.ai/download`
2. Download the Windows worker installer when a prototype/public download is available.
3. Verify the SHA256 checksum from the linked checksum file.
4. Install and open **OpenCause Compute Worker**.
5. Follow first-run setup:
   - check/install Ollama if prompted
   - choose an approved local model, usually `llama3.2:3b`
   - download the selected model from the worker UI
   - set resource limits
   - request or enter a one-time enrollment code
6. Keep activity visible. You can pause/resume the worker and remove local worker data from the desktop app.

Prototype builds are for selected testers only. They may show Windows warnings until code signing is implemented.

### What the worker does

- Processes open/public literature work packets from the coordinator.
- Verifies packet signatures before extraction.
- Runs approved local model workflows only.
- Sends back candidate facts, summary text, validation status, and provenance.
- Stores local worker credentials and logs in the app data directory.
- Lets you pause/resume work and control resource use.

### What the worker should not do

- It should not process your private files.
- It should not hide background activity.
- It should not provide medical advice.
- It should not be treated as scientific acceptance of any extracted fact. Consensus and review are still required.

## Public web surfaces

- `/` — public landing page
- `/about` — overview
- `/download` — worker download links when configured
- `/volunteer` — public volunteer enrollment when enabled
- `/impact` — public aggregate impact dashboard with conservative scientific language
- `/leaderboards`, `/leaderboards/volunteers`, `/leaderboards/teams` — privacy-aware recognition surfaces for opted-in profiles and public teams
- `/privacy`, `/terms`, `/security`, `/science-disclaimer`, `/responsible-disclosure` — trust/legal pages
- `/api/health` — non-secret health check

Coordinator/admin surfaces are protected behind admin authentication. See `docs/gamification.md` for contribution scoring, badges, teams, privacy behavior, and anti-abuse guardrails.

## For operators

Hosted deployments should set `OPENCAUSE_HOSTED=true` and use Postgres relational storage.

Required hosted configuration includes:

- `DATABASE_URL`
- `PACKET_SIGNING_PRIVATE_KEY`
- `PACKET_SIGNING_PUBLIC_KEY`
- `ADMIN_API_KEY`
- `ADMIN_UI_PASSWORD` recommended
- `NCBI_EMAIL`
- `CRON_SECRET` when `ENABLE_CRON_INGEST=true`

Volunteer enrollment/download configuration:

- `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=true`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `ENROLLMENT_EMAIL_FROM`
- `NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL`
- `NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL`
- `NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL`
- `NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=prototype | public-beta | public`

Abuse monitoring/readiness configuration:

- `ABUSE_ALERT_WEBHOOK_URL` or `ABUSE_ALERT_EMAIL_TO`
- optional `ABUSE_WARN_*` thresholds described in `docs/abuse-monitoring.md`

Database migrations live in `db/migrations`:

```bash
DATABASE_URL=... npm run db:migrate
```

## For developers

Developer setup still uses Node/npm. This is only for contributors working on the repo, not for ordinary volunteers.

```bash
npm ci
npm run build
npm run typecheck
npm run test
```

Useful local commands:

```bash
npm run dev:web
npm run start:up
npm run start:worker:once
npm run start:worker:loop
npm run package:win:unsigned -w @opencause/desktop
```

Local development may use file storage and fallback signing; hosted/public deployments must use Postgres and Ed25519 packet signing.

## Desktop release process

Windows desktop installers are built by GitHub Actions and published to GitHub Releases. See:

- `docs/desktop-release-process.md`
- `docs/windows-release-qa-checklist.md`
- `docs/code-signing-plan.md`
- `docs/release-rollback.md`

Current prototype releases are unsigned. Public release requires signed installer/executable, clean-machine QA, published checksums, and rollback notes.

## Architecture and safety docs

- `docs/architecture.md`
- `docs/security.md`
- `docs/model-runtime-plan.md`
- `docs/worker-release-and-sandbox-plan.md`
- `docs/consensus-validation.md`
- `docs/public-volunteer-onboarding.md`
- `docs/public-launch-status.md`
- `docs/public-launch-checklist.md`

## Scientific posture

OpenCause Compute extracts structured candidate facts from literature. Format/schema validation means the output is parseable and citation-backed; it does **not** mean the fact is scientifically accepted. No extracted fact should be considered accepted solely because one worker produced valid JSON.

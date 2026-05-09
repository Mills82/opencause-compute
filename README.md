# OpenCause Compute V1 Release

OpenCause Compute is a volunteer-compute platform for AI-powered open science.

V1 release includes:
- Next.js coordinator/dashboard (`apps/web`)
- Worker runtime (`apps/worker`)
- Shared schemas/signing/validation (`packages/shared`)
- Local-LLM extraction by default (`Local LLM v1`)
- Real literature packet ingestion from PubMed and PMC Open Access

## Positioning

Donate your idle computer to AI-powered open science.

This release does **not** make medical claims.

## User quick start

1. Install and verify:

```bash
npm run setup
```

2. Start local LLM runtime:

```bash
ollama serve
ollama pull llama3.2:3b
```

3. Start OpenCause Compute:

```bash
npm run start:up
```

4. Open the dashboard at `http://localhost:3000` and use `/nodes` controls to:
- Pause/resume processing
- Configure idle thresholds and max CPU
- Trigger `Run one packet now` for testing

## Worker behavior

- Processing only runs when idle thresholds pass.
- Default extractor mode is Local LLM.
- Mock extractor is disabled by default and only for explicit development opt-in.

## Storage

- Recommended: Postgres via `DATABASE_URL`.
- Fallback: local file DB at `apps/web/data/db.json`.
- Hosted deployments can enable scheduled ingestion with Vercel Cron on `/api/admin/ingest/cron` using `CRON_SECRET`.

## Installers

Current V1 provides script installers:
- macOS/Linux: `npm run release:install:unix`
- Windows PowerShell: `npm run release:install:windows`

Persistent worker service:
- Unix/macOS:
  - `npm run service:install:unix`
  - `npm run service:start:unix`
  - `npm run service:stop:unix`
  - `npm run service:status:unix`
  - `npm run service:uninstall:unix`
- Windows:
  - `npm run service:install:windows`
  - `npm run service:start:windows`
  - `npm run service:stop:windows`
  - `npm run service:status:windows`
  - `npm run service:uninstall:windows`

## Scripts

```bash
npm run setup
npm run start:up
npm run start:web
npm run start:worker:once
npm run start:worker:loop
npm run build
npm run typecheck
npm run test
```

## Security note

V1 uses symmetric HMAC signing for packet verification as an interim mechanism. See `docs/security.md`.


## Private alpha

This repo is safe only for controlled private-alpha testing with trusted testers. See `docs/private-alpha-runbook.md`. Results are citation-backed candidate facts; format validation is not scientific validation and this is not medical advice.

## Hosted private-alpha safety

The hosted site is split into a public informational surface and a private coordinator surface:

- Public: `/`, `/about`, `/api/health`.
- Private coordinator UI: `/admin`, `/projects`, `/work-packets`, `/results`, `/nodes`.
- Admin login: `/admin/login`, backed by an HTTP-only cookie from `ADMIN_UI_PASSWORD` or `ADMIN_API_KEY`.

For hosted/private-alpha deployments, set `OPENCAUSE_HOSTED=true` and configure at minimum:

- `DATABASE_URL`
- `SIGNING_SECRET`
- `ADMIN_API_KEY`
- `ADMIN_UI_PASSWORD` (recommended, may fall back to `ADMIN_API_KEY`)
- `NCBI_EMAIL`
- `CRON_SECRET` when `ENABLE_CRON_INGEST=true`

Optional coordinator settings include `NCBI_API_KEY`, `DEFAULT_PACKET_EXTRACTOR`, `ALLOW_MOCK_RESULTS`, `OPENCAUSE_LOCAL_DEV`, `ENABLE_CRON_INGEST`, PubMed/PMC query and retmax settings.

Worker settings include `COORDINATOR_URL`, `EXTRACTOR_MODE`, `LOCAL_LLM_ENDPOINT`, `LOCAL_LLM_MODEL`, `IDLE_MODE`, `MIN_IDLE_SECONDS`, and `MAX_CPU_PERCENT`.

Set `NODE_ENROLLMENT_CODES` to one or more comma-separated private-alpha invite codes before exposing registration. Workers must pass a valid `enrollmentCode` during registration when codes are configured. Admins can suspend or revoke nodes through `POST /api/admin/nodes/:nodeId/status`.

OpenCause Compute remains private-alpha until the blockers in `docs/public-launch-checklist.md` are closed. Results are candidate, citation-backed extractions; format/schema validation is not scientific validation or medical advice.

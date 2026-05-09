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

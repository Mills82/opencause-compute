# OpenCause Compute V1 Release

OpenCause Compute is a volunteer-compute platform for AI-powered open science.

V1 release includes:
- Next.js coordinator/dashboard (`apps/web`)
- CLI worker (`apps/worker`)
- Shared schemas, signing, extractor, validation (`packages/shared`)
- Local file DB fallback for immediate setup (`apps/web/data/db.json`)

## Positioning

Donate your idle computer to AI-powered open science.

V1 does **not** make medical claims.

Extractor status:
- Current implementation: deterministic `Mock Extractor v1` (real packet processing flow, non-LLM extraction logic)
- Not implemented yet: small local LLM extraction backend (planned next step)

## Quick start (release mode)

1. Install and verify:

```bash
npm run setup
```

2. Start the full stack in one command (web + seed + worker loop):

```bash
npm run start:up
```

3. Open dashboard routes in browser:
- `/`
- `/projects`
- `/projects/[id]`
- `/work-packets`
- `/results`
- `/nodes`
- `/about`

4. Stop everything with `Ctrl+C`.

## Manual start (separate terminals)

1. Start web coordinator:

```bash
npm run start:web
```

2. Seed demo project/packets:

```bash
npm run demo:seed
```

3. Run worker:

```bash
npm run start:worker:once
# or continuous loop:
npm run start:worker:loop
```

4. Use `/nodes` Worker Controls to:
- Pause/resume worker processing
- Set idle mode, idle delay, and max CPU
- Trigger `Run one packet now` for manual testing without waiting for idle

## Idle behavior

The worker only processes packets when idle thresholds pass:
- `IDLE_MODE=user-and-cpu` (default): requires user-idle signal + CPU threshold
- `IDLE_MODE=cpu-only`: CPU threshold only
- `MIN_IDLE_SECONDS` default `120`
- `MAX_CPU_PERCENT` default `35`

Examples:

```bash
IDLE_MODE=cpu-only MAX_CPU_PERCENT=30 npm run start:worker:loop
```

```bash
npm run start:worker:loop -- --idle-mode user-and-cpu --min-idle-seconds 180
```

## Installers and packaging

Current V1 provides script-based installers:
- macOS/Linux: `npm run release:install:unix`
- Windows PowerShell: `npm run release:install:windows`

Persistent worker service management:
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

Best file type for broad user install:
- Windows-first audience: signed `.exe` or `.msi`
- macOS: signed `.pkg`
- Linux: `.deb`/`.rpm` or AppImage

This repo currently ships script installers and runtime commands, with native signed installers planned as the next packaging step.

## API endpoints

- `POST /api/nodes/register`
- `POST /api/nodes/heartbeat`
- `POST /api/work/claim`
- `POST /api/work/submit`
- `GET /api/projects`
- `GET /api/work-packets`
- `GET /api/results`
- `POST /api/admin/seed-demo-data`
- `GET /api/worker/control`
- `POST /api/worker/control`
- `POST /api/worker/run-now`

## Scripts

From repo root:

```bash
npm run setup
npm run start:up
npm run start:web
npm run start:worker:once
npm run start:worker:loop
npm run release:install:unix
npm run release:install:windows
npm run service:install:unix
npm run service:start:unix
npm run service:stop:unix
npm run service:status:unix
npm run service:uninstall:unix
npm run service:install:windows
npm run service:start:windows
npm run service:stop:windows
npm run service:status:windows
npm run service:uninstall:windows
npm run demo:up
npm run demo:web
npm run demo:seed
npm run build
npm run typecheck
npm run test
```

## Security note

V1 uses symmetric HMAC signing for packet verification as an interim mechanism. See `docs/security.md` for limits and hardening roadmap.

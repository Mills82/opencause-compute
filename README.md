# OpenCause Compute V1

OpenCause Compute is a volunteer-compute platform for AI-powered open science.

V1 vertical slice includes:
- Next.js coordinator/dashboard (`apps/web`)
- CLI worker (`apps/worker`)
- Shared schemas, signing, extractor, validation (`packages/shared`)
- Local file DB fallback for immediate dev demo (`apps/web/data/db.json`)

## Positioning

Donate your idle computer to AI-powered open science.

V1 does **not** make medical claims and uses deterministic `Mock Extractor v1` only.

## Quick start

1. Install + verify once:

```bash
npm run setup
```

2. Start full demo stack (web + seed + worker loop) in one command:

```bash
npm run demo:up
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

## Manual mode (separate terminals)

1. Start web coordinator:

```bash
npm run demo:web
```

2. Seed demo project/packets:

```bash
npm run demo:seed
```

3. Run worker:

```bash
npm run demo:worker:once
# or continuous loop:
npm run demo:worker:loop
```

## API endpoints

- `POST /api/nodes/register`
- `POST /api/nodes/heartbeat`
- `POST /api/work/claim`
- `POST /api/work/submit`
- `GET /api/projects`
- `GET /api/work-packets`
- `GET /api/results`
- `POST /api/admin/seed-demo-data`

## Scripts

From repo root:

```bash
npm run setup
npm run demo:up
npm run demo:web
npm run demo:seed
npm run demo:worker:once
npm run demo:worker:loop
npm run build
npm run typecheck
npm run test
```

## Security note

V1 uses symmetric HMAC signing for packet verification as an interim mechanism. See `docs/security.md` for limits and hardening roadmap.

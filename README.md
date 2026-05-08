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

1. Install dependencies:

```bash
npm install
```

2. Seed demo data:

```bash
cd apps/web
npm run dev
# In another shell:
curl -X POST http://localhost:3000/api/admin/seed-demo-data
```

3. Run worker once (auto-registers if no node id):

```bash
cd apps/worker
npm run dev -- run-once --server http://localhost:3000
```

4. Open dashboard routes in browser:
- `/`
- `/projects`
- `/projects/[id]`
- `/work-packets`
- `/results`
- `/nodes`
- `/about`

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
npm run build
npm run typecheck
npm run test
```

## Security note

V1 uses symmetric HMAC signing for packet verification as an interim mechanism. See `docs/security.md` for limits and hardening roadmap.

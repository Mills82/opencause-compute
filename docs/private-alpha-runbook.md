# OpenCause Compute private-alpha runbook

OpenCause Compute is private-alpha infrastructure for AI-assisted open science. Cancer Knowledge Miner creates citation-backed candidate facts from open-access biomedical literature. The current system performs schema/format validation and evidence-sentence matching; it does **not** scientifically validate biomedical claims and is not medical advice.

## What private alpha means

Trusted testers may run a coordinator and worker, ingest public/open-access literature, and inspect candidate facts. This is not a public volunteer launch.

## Safe to test

- Local coordinator/dashboard flows.
- Trusted worker registration, heartbeat, claim, process, submit.
- PubMed/PMC Open Access ingestion with modest limits.
- Local LLM extraction via Ollama.
- Demo data seeding.

## Not ready yet

- Public volunteer onboarding.
- Scientific consensus validation.
- Medical or clinical decision support.
- Giving workers server signing secrets long-term.
- Adversarial abuse/rate-limit resistance.

## Required environment

Coordinator private-alpha minimum: `DATABASE_URL`, `SIGNING_SECRET`, `ADMIN_API_KEY`; set `CRON_SECRET` if cron ingestion is enabled. Also configure `NCBI_EMAIL`, optional `NCBI_API_KEY`, `DEFAULT_PACKET_EXTRACTOR`, and `ALLOW_MOCK_RESULTS`.

Worker minimum: `COORDINATOR_URL`, `EXTRACTOR_MODE`, `ALLOW_MOCK_EXTRACTOR`, `LOCAL_LLM_ENDPOINT`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_TIMEOUT_MS`, `IDLE_MODE`, `MIN_IDLE_SECONDS`, `MAX_CPU_PERCENT`.

## Local coordinator setup

```bash
npm ci
cp .env.example .env.local
npm run dev:web
```

Local development may allow unauthenticated admin calls. Private-alpha/hosted deployments must set `ADMIN_API_KEY` and send it as `Authorization: Bearer <key>` or `x-admin-key: <key>` for privileged POST routes.

## Hosted coordinator setup

Set the coordinator env vars in the host. Use a real Postgres `DATABASE_URL`, long random `SIGNING_SECRET`, long random `ADMIN_API_KEY`, and `CRON_SECRET` if cron ingestion is enabled. Do not use the dev signing secret in hosted mode.

## Worker setup

```bash
npm run build
npm run start:worker:once -- --server https://your-coordinator.example
```

The worker stores `~/.opencause-compute/node.json` with its node id and node token. The raw token is returned only once by registration and should not be logged or shared.

## Ollama setup

Install Ollama, pull the configured model, and keep the local endpoint reachable:

```bash
ollama pull llama3.2:3b
```

## Seed demo data

```bash
curl -X POST http://localhost:3000/api/admin/seed-demo-data \
  -H 'Authorization: Bearer <ADMIN_API_KEY>'
```

## Ingest PubMed/PMC data

Use the admin ingest endpoints with the admin key. Keep retmax modest for private alpha and inspect summaries for skipped/failure counts where available.

## Run one worker packet

```bash
npm run start:worker:once -- --server http://localhost:3000 --force-now true
```

## Monitor results

Use the dashboard and Results page. Treat entries as citation-backed candidate facts with format validation only.

## Pause workers / run now

Use the Nodes control panel or POST `/api/worker/control` / `/api/worker/run-now` with admin authorization.

## Stop/uninstall worker service

Use the provided service scripts for your platform, e.g. `npm run service:stop:unix` and `npm run service:uninstall:unix`.

## Known limitations and public-release blockers

- No consensus validation or human scientific review workflow yet.
- HMAC signing is private-alpha-only; asymmetric signing is required before public volunteer release.
- Workers should not receive server signing secrets long-term.
- Local LLM accuracy varies by model and prompt.
- Installer and service UX need more hardening.
- Rate limiting/abuse controls are minimal.

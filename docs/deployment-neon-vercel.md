# Deployment: Vercel + Neon

This is the recommended V1 hosted setup using accounts you already have.

## Architecture

- Vercel: hosts Next.js coordinator app (`apps/web`)
- Neon: stores coordinator state in Postgres (`opencause_state` table)
- Volunteer workers: run locally on user PCs and submit results to the Vercel coordinator URL
- Local LLM: runs on each volunteer machine (default Ollama endpoint `http://127.0.0.1:11434`)

## Vercel project setup

1. Import this repo into Vercel.
2. Set Root Directory to `apps/web`.
3. Build command: `npm run build`.
4. Install command: `npm install`.

## Required environment variables

Set in Vercel Project Settings -> Environment Variables:

- `DATABASE_URL` = Neon pooled connection string
- `SIGNING_SECRET` = long random secret shared with worker app
- `ADMIN_API_KEY` = random admin key for protected admin endpoints

Recommended:

- `NCBI_EMAIL` = contact email for E-utilities usage
- `NCBI_API_KEY` = NCBI API key for higher ingest throughput
- `DEFAULT_PACKET_EXTRACTOR=local-llm-v1`
- `ALLOW_MOCK_RESULTS=false`

## Worker configuration

On each worker machine:

- `COORDINATOR_URL=https://<your-vercel-domain>`
- `SIGNING_SECRET=<same as coordinator>`
- `EXTRACTOR_MODE=local-llm`
- `LOCAL_LLM_ENDPOINT=http://127.0.0.1:11434`
- `LOCAL_LLM_MODEL=llama3.2:3b`

## Admin API usage (protected)

Use `x-admin-key: <ADMIN_API_KEY>` header.

Seed demo data:

```bash
curl -X POST https://<your-vercel-domain>/api/admin/seed-demo-data \
  -H 'x-admin-key: <ADMIN_API_KEY>'
```

Ingest real PubMed abstracts:

```bash
curl -X POST https://<your-vercel-domain>/api/admin/ingest/pubmed \
  -H 'content-type: application/json' \
  -H 'x-admin-key: <ADMIN_API_KEY>' \
  -d '{"query":"EGFR NSCLC resistance","retmax":25}'
```

## Notes

- This setup is enough to start without additional services.
- Add object storage later (R2/S3) if you start storing large full-text corpora and raw artifacts.
- Current ingestion endpoint creates packets from PubMed abstract text. Full PMC OA bulk/full-text ingestion is the next increment.

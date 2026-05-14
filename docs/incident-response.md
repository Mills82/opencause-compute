# OpenCause Compute incident response

Private-alpha operator notes. Keep public-facing claims conservative until the full public-launch checklist is closed.

## Pause all worker activity

1. Sign in to `/admin`.
2. Open `/nodes`.
3. In Worker Controls, set **Paused** and save.
4. Verify `/api/worker/control` reports `paused: true`.

## Revoke or suspend a node

Use the admin session/cookie or admin bearer token:

```bash
curl -X POST https://opencause.appassist.ai/api/admin/nodes/<nodeId>/status \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $ADMIN_API_KEY" \
  -d '{"status":"revoked"}'
```

Revoked/suspended nodes cannot authenticate, heartbeat, claim, or submit. Require re-enrollment for replacement workers.

## Disable ingestion

- Disable the Vercel cron trigger, or set `ENABLE_CRON_INGEST=false`.
- Rotate `CRON_SECRET` if a cron token may be exposed.
- Review `/admin` and `/api/admin/ingestion-runs` for failed or partial ingestion runs.

## Rotate packet signing keys

1. Generate a new Ed25519 keypair.
2. Update Vercel `PACKET_SIGNING_PRIVATE_KEY`, `PACKET_SIGNING_PUBLIC_KEY`, and `PACKET_SIGNING_KEY_ID`.
3. Redeploy coordinator.
4. Update worker `PACKET_SIGNING_PUBLIC_KEY` and `PACKET_SIGNING_KEY_ID`.
5. Let old in-flight packets expire before removing old worker configs.

## Suspected data or secret exposure

- Rotate affected secrets immediately.
- Revoke affected nodes.
- Pause work if packet authenticity or worker trust is uncertain.
- Check ingestion run history, result provenance, and `/api/admin/audit-events` before trusting new outputs.

## Science-risk incident

If output is presented as validated, clinical, or medical advice by mistake:

1. Remove or hide the public surface.
2. Restore wording to candidate evidence / format validation / requires consensus or human review.
3. Add a note to launch checklist before continuing.

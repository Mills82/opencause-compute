# Release rollback procedure

OpenCause Compute public releases should be reversible without data loss or hidden background work. Use this procedure for hosted web/coordinator releases and desktop worker artifacts.

## Hosted web/coordinator rollback

1. Identify the last known-good commit SHA and deployment id.
2. Disable new risky intake before rollback if abuse, bad enrollment, or bad work dispatch is involved:
   - set `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=false`
   - set `ENABLE_CRON_INGEST=false` if ingestion is implicated
   - pause worker dispatch from the admin worker-control page if needed
3. Redeploy the last known-good commit through the hosting provider.
4. Keep the same production database unless a migration explicitly requires reversal.
5. If a schema migration is implicated:
   - prefer forward repair migrations over destructive rollback
   - snapshot/export affected tables first
   - verify `projects`, `work_packets`, `work_claims`, `extraction_results`, `extracted_facts`, `audit_events`, `rate_limit_buckets`, and `volunteer_enrollments`
6. Verify after rollback:
   - `/api/health` returns OK
   - `/api/readiness` is reachable
   - admin login works
   - protected coordinator APIs still require auth
   - registered workers can heartbeat, or are intentionally paused
7. Record the rollback in release notes with commit SHA, deployment id, trigger, operator, and verification result.

## Desktop worker artifact rollback

1. Mark the bad artifact as revoked/deprecated in release notes and remove public download links.
2. Restore `NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL`, checksum URL, and release-notes URL to the last known-good artifact, or clear them to remove downloads.
3. Keep `NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=prototype` unless the artifact is signed and public-QA approved.
4. Publish SHA256 checksums for the restored artifact.
5. Tell affected testers to stop the worker and install the restored build.
6. If local credentials may be affected, instruct testers to use **Remove local worker data** in the desktop app before reinstalling.
7. If node tokens may be compromised, suspend or revoke affected nodes from admin before re-enrollment.

## Worker network safety rollback

Use these controls when a bad release may produce incorrect work or excessive load:

1. Pause worker dispatch from admin worker control.
2. Suspend or revoke affected node ids.
3. Lower claim/submit rate limits if traffic is abusive.
4. Disable public enrollment while investigating.
5. Quarantine suspect submissions by claim/result id before consensus/export.
6. Record audit notes and preserve logs.

## Rollback test cadence

Before public beta, perform a dry-run rollback using a staging or preview deployment:

- deploy current commit
- configure prototype download URLs
- switch download URLs back to a prior artifact or blank values
- disable public enrollment
- verify health/readiness/admin access
- record the dry-run result in launch notes

Broad public launch remains blocked until a rollback dry run has been completed and recorded.

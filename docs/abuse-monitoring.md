# Abuse monitoring

OpenCause Compute has server-side rate limits and an admin abuse-monitoring snapshot for launch operations.

## Admin snapshot

Authenticated admins can fetch:

```text
GET /api/admin/abuse-monitoring
```

The response summarizes recent audit events over `ABUSE_MONITOR_WINDOW_MINUTES` and reports signals for:

- public volunteer enrollment volume
- Turnstile challenge failures
- enrollment email delivery failures
- node registration volume
- work claim volume
- work submission volume
- validation failures
- node suspensions/revocations

Each signal includes `count`, `threshold`, and severity: `info`, `warn`, or `critical`.

## Configuration

Optional threshold env vars:

```bash
ABUSE_MONITOR_WINDOW_MINUTES=60
ABUSE_WARN_PUBLIC_ENROLLMENTS_PER_HOUR=25
ABUSE_WARN_CHALLENGE_FAILURES_PER_HOUR=20
ABUSE_WARN_EMAIL_FAILURES_PER_HOUR=5
ABUSE_WARN_NODE_REGISTRATIONS_PER_HOUR=20
ABUSE_WARN_WORK_CLAIMS_PER_HOUR=500
ABUSE_WARN_WORK_SUBMISSIONS_PER_HOUR=500
ABUSE_WARN_VALIDATION_FAILURES_PER_HOUR=20
ABUSE_WARN_NODE_ENFORCEMENTS_PER_HOUR=5
```

Readiness treats alerting as configured when either destination exists:

```bash
ABUSE_ALERT_WEBHOOK_URL=
ABUSE_ALERT_EMAIL_TO=
```

Current implementation exposes the snapshot for admin/operator polling and launch dashboards. Wire the webhook/email destination to the hosting provider, uptime monitor, or scheduled operator check before broad traffic.

## Response playbook

If a signal is `warn` or `critical`:

1. Check recent audit events in `/api/admin/audit-events`.
2. Disable public enrollment if enrollment or challenge pressure is suspicious.
3. Suspend/revoke abusive nodes.
4. Pause worker dispatch if claim/submit pressure looks unsafe.
5. Quarantine suspect submissions before consensus/export.
6. Preserve logs and record the action in launch notes.

## Launch gate

Selected public beta may proceed with admin polling plus a configured alert destination. Broad public launch should include provider/edge monitoring around the same signals, not only application-level snapshots.

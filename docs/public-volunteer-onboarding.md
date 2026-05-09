# Public volunteer onboarding plan

Goal: move from private invite codes to self-serve public volunteer enrollment without allowing unlimited anonymous node spam.

## Current foundation

- `POST /api/volunteer/enroll` can issue a one-time enrollment code when `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=true`.
- Hosted/public enrollment is protected with Cloudflare Turnstile via `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY`.
- Hosted/public enrollment requires configured email delivery (`RESEND_API_KEY` and `ENROLLMENT_EMAIL_FROM`) before codes are issued.
- Selected testers use the Windows desktop worker installer and enter the one-time code during registration. Developer/CLI testers can still use `NODE_ENROLLMENT_CODE` or `--enrollment-code`.
- Registration consumes the code and links it to the created node.
- Admins can suspend/revoke nodes after registration.

## Why this replaces private invites

Private-alpha `NODE_ENROLLMENT_CODES` are static operator-issued invite codes. Public enrollment codes are self-serve, one-time, tracked, and revocable through node status after use. This lets anyone sign up once the desktop worker UX is ready, while still preserving abuse controls.

## Still needed before turning it on publicly

- Exercise the `/volunteer` Turnstile and email flow in hosted preview before enabling public enrollment.
- Configure alert destinations and provider/edge monitoring around enrollment spikes, repeated failures, and disposable-domain abuse.
- Continue improving admin review workflows for enrollments and suspicious activity.
- Complete clean-machine QA for the Windows desktop worker installer so volunteers are not asked to run Node/npm.

## Suggested launch progression

1. Keep `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=false` until the current Windows prototype has passed clean-machine QA or the tester group is explicitly controlled.
2. Test the endpoint with Turnstile and email delivery in preview/staging.
3. Enable for a small selected public beta using the desktop installer.
4. Monitor enrollments, node registrations, claims, submissions, and audit/abuse-monitoring events.
5. Move to broad public launch only after signing, clean-machine QA, sandbox/resource checks, abuse monitoring, and reviewer/consensus workflows are ready.

## Admin management

- `GET /api/admin/volunteer-enrollments` lists recent enrollments without exposing enrollment code hashes.
- `POST /api/admin/volunteer-enrollments/:enrollmentId/status` can set an unused enrollment to `issued` or `revoked`.
- Used enrollments cannot be moved back to issued; revoke/suspend the linked node instead.
- The admin dashboard shows enrollment counts and recent enrollment activity.

## Email delivery

`POST /api/volunteer/enroll` can email one-time enrollment codes when these are configured:

```bash
RESEND_API_KEY=
ENROLLMENT_EMAIL_FROM=Alan <alan@appassist.ai>
SHOW_ENROLLMENT_CODE_IN_BROWSER=false
```

In local development, the API can fall back to console/browser code display for testing. In hosted or production mode, enrollment fails closed with `enrollment_email_not_configured` unless email delivery is configured, so public codes are not displayed directly in the browser.

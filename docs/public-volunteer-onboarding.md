# Public volunteer onboarding plan

Goal: move from private invite codes to self-serve public volunteer enrollment without allowing unlimited anonymous node spam.

## Current foundation

- `POST /api/volunteer/enroll` can issue a one-time enrollment code when `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=true`.
- Hosted/public enrollment should be protected with Cloudflare Turnstile via `TURNSTILE_SECRET_KEY`.
- The worker uses the one-time code through `NODE_ENROLLMENT_CODE` or `--enrollment-code` during registration.
- Registration consumes the code and links it to the created node.
- Admins can suspend/revoke nodes after registration.

## Why this replaces private invites

Private-alpha `NODE_ENROLLMENT_CODES` are static operator-issued invite codes. Public enrollment codes are self-serve, one-time, tracked, and revocable through node status after use. This lets anyone sign up once the desktop worker UX is ready, while still preserving abuse controls.

## Still needed before turning it on publicly

- Add a real UI form on `/volunteer` with Turnstile widget.
- Decide whether the enrollment code is shown immediately, emailed, or both.
- Add email verification/delivery if codes should not be displayed directly.
- Add stronger per-email/per-IP limits backed by durable/distributed storage.
- Add admin view for enrollments and suspicious activity.
- Ship the desktop worker app/installer so volunteers are not asked to run Node/npm.

## Suggested launch progression

1. Keep `ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT=false` while installer work is incomplete.
2. Test the endpoint with Turnstile in preview/staging.
3. Enable for a small public beta.
4. Monitor enrollments, node registrations, claims, submissions, and audit events.
5. Move to broad public launch only after installer, sandbox, distributed abuse controls, and reviewer/consensus workflows are ready.

## Admin management

- `GET /api/admin/volunteer-enrollments` lists recent enrollments without exposing enrollment code hashes.
- `POST /api/admin/volunteer-enrollments/:enrollmentId/status` can set an unused enrollment to `issued` or `revoked`.
- Used enrollments cannot be moved back to issued; revoke/suspend the linked node instead.
- The admin dashboard shows enrollment counts and recent enrollment activity.

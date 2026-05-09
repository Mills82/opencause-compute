# Dependency audit exception: Next/PostCSS moderate advisory

Date: 2026-05-09

## Advisory

`npm audit` currently reports two moderate findings:

- `postcss` advisory GHSA-qx2v-qp2m-jg93: XSS via unescaped `</style>` in CSS stringify output for `postcss <8.5.10`.
- `next` is reported because its internal dependency tree includes the affected PostCSS range.

The audit metadata reports:

```text
moderate: 2
high: 0
critical: 0
```

`npm audit fix` suggests downgrading `next` to `9.3.3`, which is not a safe or appropriate remediation for this app.

## Current decision

Accepted as a documented moderate-risk exception for private alpha and selected public beta, pending an upstream Next.js release that carries a safe PostCSS remediation.

This exception is **not** a blanket approval for broad public launch. Re-check before public launch and remove this exception if a safe Next/PostCSS update is available.

## Rationale

- The application is on Next `16.2.6`; the suggested fix path is an invalid downgrade to a much older major version.
- OpenCause Compute does not expose user-authored CSS editing, theme authoring, or arbitrary CSS stringify features to public users.
- Public volunteer input surfaces are constrained to email/enrollment, node registration/heartbeat/claim/submit payloads, and admin-gated coordinator workflows.
- Existing UI copy and API payloads should still be handled as untrusted data; this exception does not relax escaping or sanitization requirements.

## Controls while accepted

- Keep broad public launch blocked until a final audit review is done.
- Continue to run `npm audit` before release candidates.
- Monitor Next.js/PostCSS advisories for a safe patched dependency path.
- Do not add user-authored CSS/theme input surfaces while this exception is open.
- If a safe patched Next/PostCSS version becomes available, update and remove this exception.

## Revalidation command

```bash
npm audit --audit-level=moderate
```

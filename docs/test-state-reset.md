# Test state reset

OpenCause Compute has an admin-only private-alpha reset endpoint for clearing launch-test residue before inviting real volunteers.

Endpoint:

```text
POST /api/admin/reset-test-state
```

Required safeguards:

- admin authorization required
- `ENABLE_ADMIN_TEST_RESET=true` must be set
- request body must include `{ "confirm": "RESET_TEST_STATE" }`
- reset action is audit-logged

It clears:

- projects
- work packets
- nodes
- claims
- results
- candidate evidence records
- ingestion runs
- volunteer enrollments
- worker-control state back to defaults

It preserves audit events, including the reset event itself.

## Intended use

Use only before real users/data exist, or for disposable staging/private-alpha environments. Do not enable this endpoint for broad public production operations once real volunteer work exists.

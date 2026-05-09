# Dependency audit status

Last triaged during the public-launch hardening pass.

## Fixed / reduced

- Removed the previous critical Next.js finding by updating within the safe Next 14 line where available.
- Upgraded Electron desktop prototype dependencies:
  - `electron` to the audited major line used in the current lockfile
  - `electron-builder` to the audited major line used in the current lockfile
- Upgraded Vitest/dev-server test tooling to remove Vite/esbuild-related audit findings.

After these upgrades, build/typecheck/test passed across all workspaces.

## Remaining audit findings

`npm audit` currently reports only:

- `next` — high severity, direct dependency
- `postcss` — moderate transitive via Next

NPM reports the available fix as a major upgrade to Next 16.x. Do not apply this with `npm audit fix --force` without a deliberate migration pass because the web app is currently on Next 14 and the upgrade may require framework/runtime changes.

## Public launch implication

Broad public launch should include either:

1. a successful Next 16 migration with full route/auth/API regression testing, or
2. a documented security exception if the specific advisory does not affect this deployment.

Private alpha/public demo can continue with this documented risk while the site remains low-traffic, admin surfaces protected, and no public worker enrollment is enabled.

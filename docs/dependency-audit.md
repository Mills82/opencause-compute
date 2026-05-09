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

The app has been migrated to Next 16.2.6 and the prior high-severity Next finding is gone. `npm audit` currently reports two moderate findings involving `next`/`postcss`; npm suggests a nonsensical semver-major downgrade path to Next 9.3.3, so this needs advisory-level review rather than force-fix automation.

## Public launch implication

Broad public launch should include advisory-level review of the remaining moderate audit findings and either a safe dependency update when available or a documented exception if the advisories do not affect this deployment.

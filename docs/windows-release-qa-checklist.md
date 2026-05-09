# Windows desktop release QA checklist

This checklist applies after the unsigned prototype artifact is produced by `.github/workflows/desktop-windows-artifact.yml`.

Status: **not public-release ready** until every required item is complete.

## Artifact provenance

- [ ] Artifact came from GitHub Actions `windows-latest`, not an ad-hoc local machine.
- [ ] Commit SHA is recorded in release notes.
- [ ] Artifact name includes `unsigned-prototype` until signing is implemented.
- [ ] SHA256 checksums are generated and published with the artifact.
- [ ] Build logs are archived.

## Signing gate

- [ ] Code-signing certificate selected.
- [ ] Signing secrets stored in GitHub Actions secrets, not repo files.
- [ ] Installer is signed.
- [ ] Main executable is signed.
- [ ] Windows SmartScreen/reputation implications are documented.
- [ ] Signature verified on a clean Windows machine.

## Clean Windows install test

Use a clean Windows VM or physical machine with no repo checkout and no developer tooling assumptions.

- [ ] Installer launches without requiring Node/npm/git.
- [ ] Install directory can be selected.
- [ ] Start menu shortcut works.
- [ ] Desktop shortcut works if selected.
- [ ] App opens to welcome/science disclaimer.
- [ ] App explains no medical advice and volunteer resource use.
- [ ] App can request/accept enrollment code.
- [ ] App can register worker node.
- [ ] Local app data directory is created in expected user-data location.
- [ ] Node token and enrollment code are not displayed after registration.
- [ ] Activity log is visible.
- [ ] Worker pause/resume works.
- [ ] Resource settings persist.
- [ ] Worker verifies signed packets before processing.
- [ ] Worker can heartbeat, claim, and submit against staging/private-alpha coordinator.
- [ ] Suspended/revoked node state is handled clearly.

## Uninstall test

- [ ] App uninstalls from Windows Apps/Programs.
- [ ] User is told what local data remains, if any.
- [ ] Local credentials/logs can be removed.
- [ ] Startup-on-login entry is removed if enabled.
- [ ] No background worker process remains after uninstall.

## Update test

- [ ] Update mechanism selected.
- [ ] Update channel/channel policy documented.
- [ ] Downgrade/rollback behavior documented.
- [ ] Failed update leaves worker stopped or on prior working version, not half-updated.

## Security/resource test

- [ ] Worker cannot access arbitrary user files through remote instructions.
- [ ] Only approved extractor/runtime path is available.
- [ ] CPU settings are honored.
- [ ] Idle settings are honored.
- [ ] Battery/AC behavior is honored or clearly disabled as unsupported.
- [ ] Logs never expose node token, enrollment code, signing private key, or full sensitive local endpoints.

## Go/no-go

- Private alpha artifact: may be unsigned if distributed only to trusted testers with explicit warning.
- Public beta: installer and executable should be signed; install/uninstall/pause/log/resource tests must pass.
- Broad public launch: signed installer, update path, clean-machine QA, sandbox/resource tests, and incident rollback plan are mandatory.

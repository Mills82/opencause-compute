# Desktop release process

OpenCause Compute desktop worker downloads are published from GitHub Actions to GitHub Releases.

## Prototype / selected-tester release

Use the manual workflow:

```text
.github/workflows/desktop-windows-release.yml
```

Suggested first tag:

```text
desktop-v0.1.0-prototype.1
```

Workflow inputs:

- `tag`: release tag, e.g. `desktop-v0.1.0-prototype.1`
- `stage`: `prototype` for unsigned QA builds, `public-beta` after signing/QA, `public` only after signing verification is implemented
- `draft`: keep `true` until assets/release notes are reviewed
- `prerelease`: keep `true` for prototype/beta builds

The workflow:

1. Builds shared, worker, and desktop packages on `windows-latest`.
2. Runs shared, worker, and desktop tests.
3. Builds the unsigned Windows installer.
4. Copies the installer to `release-assets/` with a tag-specific name.
5. Generates `SHA256SUMS.txt`.
6. Generates `RELEASE-NOTES.md` containing commit SHA, workflow/run id, caveats, and site env vars.
7. Creates a GitHub Release with the installer, checksums, and release notes.

## Site download env vars

After a release is reviewed and published, configure the web deployment with the stable tag-based URLs shown in the generated release notes:

```bash
NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL=https://github.com/Mills82/opencause-compute/releases/download/<tag>/<installer>.exe
NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL=https://github.com/Mills82/opencause-compute/releases/download/<tag>/SHA256SUMS.txt
NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL=https://github.com/Mills82/opencause-compute/releases/download/<tag>/RELEASE-NOTES.md
NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=prototype
```

GitHub draft releases may show temporary asset URLs under `/releases/download/untagged-*`. Do not use those URLs for site env vars; they are draft-only placeholders. Publish the release first, then use `/releases/download/<tag>/...` URLs.

Use `NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=public` only after signing and public-release QA are complete.

## Signing gate

The current workflow intentionally builds unsigned prototype artifacts. Before `stage=public`, add signing steps that:

- sign the installer
- sign the main executable
- verify signatures on CI
- preserve signing logs/provenance
- keep signing credentials in GitHub/Azure/cloud-signing secrets, not repo files

## Clean-machine QA

Run `docs/windows-release-qa-checklist.md` against the GitHub Release asset, not a local build. Record:

- release tag
- commit SHA
- installer filename
- SHA256 checksum verification result
- Windows version/VM details
- pass/fail notes for install, registration, pause/resume, logs, resource settings, revocation handling, uninstall, and local data removal

## Rollback

Use `docs/release-rollback.md`. For desktop artifact rollback, clear or restore the download env vars to the previous known-good release and mark the bad release deprecated in GitHub release notes.

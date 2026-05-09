# Windows desktop artifact CI

The Windows worker installer should be built on Windows CI instead of requiring Wine in WSL.

Manual backup prototype artifact workflow:

```text
.github/workflows/desktop-windows-artifact.yml
```

Canonical GitHub Release publication workflow:

```text
.github/workflows/desktop-windows-release.yml
```

The artifact workflow is manual-only and should be treated as a backup/smoke artifact builder. The release workflow is the source of truth for tester downloads and site env vars. For the release process, see `docs/desktop-release-process.md`.

What it does:

1. Runs on `windows-latest`.
2. Installs dependencies with `npm ci`.
3. Builds shared, worker, and desktop packages.
4. Runs desktop tests.
5. Runs `npm run package:win:unsigned -w @opencause/desktop`.
6. Uploads unsigned prototype artifacts for inspection.

The artifact is intentionally named:

```text
opencause-compute-worker-windows-unsigned-prototype
```

## Public release caveat

The manual backup artifact workflow does **not** produce a public-ready installer. It is unsigned and intended for prototype QA only. Do not use it for canonical download URLs; use the GitHub Release workflow instead.

Before broad public download:

- add code-signing certificate/secrets
- sign the installer and executable
- test on a clean Windows machine
- verify install, register, run, pause, log visibility, uninstall
- add update strategy
- publish checksums and release notes

## Checksums and prototype notes

The workflow generates and uploads:

- `SHA256SUMS.txt`
- `PROTOTYPE-RELEASE-NOTES.md`

The notes include commit SHA, workflow name, and run id. The checksum file should be retained with any prototype artifact used for QA.

## Publishing download links

Prefer GitHub Releases as the artifact host. The public `/download` page only shows a Windows download button when these environment variables are configured:

```bash
NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL=
NEXT_PUBLIC_WINDOWS_WORKER_CHECKSUM_URL=
NEXT_PUBLIC_WINDOWS_WORKER_RELEASE_NOTES_URL=
NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=prototype
```

Leave the URL variables empty until the artifact, checksum file, and prototype release notes are ready to share. Use `NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE=public` only after signing and public-release QA are complete.

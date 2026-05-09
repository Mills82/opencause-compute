# Windows desktop artifact CI

The Windows worker installer should be built on Windows CI instead of requiring Wine in WSL.

Workflow:

```text
.github/workflows/desktop-windows-artifact.yml
```

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

This workflow does **not** produce a public-ready installer. It is unsigned and intended for prototype QA only.

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

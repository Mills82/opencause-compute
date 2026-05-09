# Code signing plan

OpenCause Compute desktop installers must be signed before broad public volunteer release.

## Windows

Preferred path:

1. Acquire an organization or EV code-signing certificate for the publisher entity.
2. Store signing material in GitHub Actions secrets or a hardware/cloud signing service.
3. Configure `electron-builder` Windows signing.
4. Sign both the installer and executable.
5. Verify signature on a clean Windows machine.
6. Publish SHA256 checksums and release notes.

Current status:

- `apps/desktop/electron-builder.json` has `signAndEditExecutable=false`.
- The GitHub Actions workflow produces an unsigned prototype artifact only.
- Public release remains blocked until signing is implemented.

## macOS

Required before public macOS release:

- Apple Developer account
- Developer ID Application certificate
- notarization workflow
- stapled notarization ticket
- clean-machine Gatekeeper test

## Linux

Linux packages may not require platform code signing in the same way, but public release should still include:

- checksums
- release notes
- package provenance
- reproducible CI build path

## Secret handling

Never commit certificates, passwords, signing tokens, or generated secrets. Use CI secrets or an external signing service.

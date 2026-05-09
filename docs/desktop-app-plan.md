# Desktop worker app plan

The public volunteer path requires a desktop app/installer. The current CLI worker is acceptable for trusted private alpha only.

## Scaffold

`apps/desktop` defines the public-launch desktop product contract:

- welcome/science disclaimer
- enrollment code signup/entry
- local runtime/model check
- visible activity log
- resource controls
- pause/resume
- uninstall/data-removal help

Run:

```bash
npm run package:plan -w @opencause/desktop
```

## Packaging target

First target: Windows signed installer (`.msi` or `.exe`) that bundles/supervises the worker so ordinary volunteers do not install Node/npm manually.

macOS notarized app and Linux packages can follow once the Windows shell/supervisor is stable.

## Implementation direction

Recommended next implementation layer:

1. Convert worker core into an importable library or stable child-process supervisor contract.
2. Build desktop shell around that contract (Tauri or Electron; prefer smaller footprint if Tauri can satisfy installer/signing needs).
3. Persist desktop settings under the same app data dir.
4. Surface worker log tail and status.
5. Add local pause/resume and resource controls.
6. Add installer/signing automation.
7. Add auto-update strategy.

## Go/no-go

Public volunteer launch remains no-go until at least one signed Windows installer is produced, installed on a clean machine, registers with self-serve enrollment, processes work visibly, pauses/resumes, and uninstalls cleanly.

## Worker supervisor contract

`apps/desktop/src/supervisor.ts` defines the desktop-to-worker boundary:

- build worker commands for registration, run-once, loop, status, and local-state uninstall
- start/stop a worker child process
- report configured/running status
- tail the visible worker log
- pass app data dir through `OPENCAUSE_APP_DIR`
- pass one-time enrollment code through registration args/env

This is intentionally a thin boundary so a future Tauri/Electron shell can own UI, installer integration, OS startup, and local settings while reusing the existing worker runtime.

## Desktop settings state

`apps/desktop/src/settings.ts` defines local desktop settings persisted as `desktop-settings.json` under the app data directory.

Current settings cover:

- coordinator URL
- one-time enrollment code / registration state
- local pause flag
- startup-on-login preference
- idle/resource controls
- model runtime/provider settings

Secrets such as enrollment codes and node tokens must be redacted before displaying settings in UI/status output.

## Desktop view model

`apps/desktop/src/view-model.ts` defines UI-ready screen state and action mapping for the future desktop shell.

It tracks whether the UI should block or warn on:

- disclaimer not accepted
- worker not enrolled
- runtime unavailable
- worker not running
- local pause enabled
- battery/resource settings

This keeps product/safety logic outside a specific UI framework and makes the eventual Tauri/Electron layer thinner.

## Electron prototype shell

`apps/desktop` now includes an Electron prototype entrypoint:

- `src/electron-main.ts`
- `src/electron-preload.ts`
- `static/index.html`

Run locally with:

```bash
npm run electron:dev -w @opencause/desktop
```

This is a prototype shell only. It is not signed, not packaged, and not suitable for public volunteers until installer/signing/update/uninstall work is complete.

## Windows packaging scaffold

`apps/desktop/electron-builder.json` defines an unsigned Windows NSIS installer target and includes the built worker runtime as an extra resource.

Commands:

```bash
npm run package:dir -w @opencause/desktop
npm run package:win:unsigned -w @opencause/desktop
```

The Windows target intentionally sets `signAndEditExecutable=false`. This creates a reproducible prototype artifact path only. Public release still requires code-signing certificates, installer QA on a clean Windows machine, and an update/uninstall strategy.

## Packaging smoke test results

On the WSL build host, `npm run package:dir -w @opencause/desktop` succeeds and produces `apps/desktop/release/linux-unpacked`.

`npm run package:win:unsigned -w @opencause/desktop` successfully downloads/builds the Windows Electron payload and produces `apps/desktop/release/win-unpacked`, including `OpenCause Compute Worker.exe`, but NSIS installer finalization is blocked on this Linux/WSL host because Wine is missing:

```text
wine is required, please see https://electron.build/multi-platform-build#linux
```

For a full Windows installer artifact, run on Windows or install/configure Wine in CI. The generated unsigned Windows artifacts are still prototype-only and not acceptable for broad public release until code signing, installer QA, update, and uninstall testing are complete.

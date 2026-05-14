# Worker release and sandbox plan

OpenCause Compute now has a Windows desktop installer prototype for selected tester QA. Broad public volunteer release still requires signing, clean-machine QA, and stronger sandbox/resource verification.

## Current private-alpha worker behavior

- Selected Windows testers should use the desktop installer prototype rather than installing Node/npm.
- Stores local credentials and logs under `~/.opencause-compute` by default, or `OPENCAUSE_APP_DIR` when configured.
- Refuses obviously unsafe app data dirs such as the home directory or filesystem root.
- Persists node credentials in `node.json` with mode `0600` where supported.
- Writes visible activity logs to `worker.log` and stdout.
- Supports coordinator pause/run-now controls.
- Verifies Ed25519 packet signatures before processing.
- Submits result provenance without exposing full local LLM endpoint URLs.

Useful local commands:

```bash
npm run start -w @opencause/worker -- status
npm run start -w @opencause/worker -- uninstall-local-state
```

`uninstall-local-state` removes local worker credentials/logs only. In the desktop app this is exposed as local worker data removal. It does not remove Ollama or downloaded models.

## Public-launch worker requirements

### Installer / desktop UX

- Windows installer with signed binaries where possible; current GitHub Release workflow produces unsigned prototype installers for QA.
- macOS and Linux packaging plan.
- No manual Node/npm requirement for ordinary volunteers; the Windows desktop installer is now the intended tester path.
- Guided Ollama/local model setup or an approved bundled runtime path.
- Tray app or small desktop UI.
- Visible activity log.
- One-click pause/resume.
- One-click uninstall.
- Startup-on-login controls.
- Resource settings UI.
- Worker version display.
- Desktop settings now pass idle mode, minimum idle seconds, schedule, and max CPU percent into the worker loop.
- Update mechanism.

### Sandbox and resource controls

- Worker must not access user files outside its app data directory except explicitly approved local model/runtime endpoints.
- No arbitrary remote code execution.
- Only approved extractor manifests may run.
- Model/runtime downloads should be hash-verified where practical.
- Resource controls:
  - max CPU
  - max RAM where practical
  - GPU toggle/future support
  - run schedule
  - battery/AC awareness
  - temperature/power guardrails where practical
  - pause on user activity

### Transparency

- The worker must never hide activity from the user.
- Logs should clearly show heartbeat, paused, idle-blocked, claimed, signature-verified, submitted, and error states.
- The UI should explain electricity/network/resource implications plainly.

## Go/no-go

- Private alpha / controlled QA: unsigned desktop prototype or CLI worker is acceptable for trusted testers.
- Selected public beta: requires a working installer, visible activity, pause/uninstall/local-data removal, resource controls, and clean-machine QA.
- Broad public launch: no-go until signing, sandbox/resource model, update path, and uninstall path are complete and tested.

## Implemented safety boundary foundation

The worker now has an approved extractor manifest in `apps/worker/src/extractor-manifest.ts`.

Current enforcement:

- `local-llm-v2` is the only approved production extractor mode.
- `local-llm-v2` is test-only and requires explicit mock allowance.
- local LLM endpoints must be localhost/loopback.
- worker credential/log paths are asserted to remain inside the configured app data directory.
- Ed25519 or configured fallback signatures are verified before extraction.
- Desktop resource settings are passed to worker idle/resource gates for loop execution.

Still needed before broad public launch:

- OS-level sandbox/entitlements where available.
- stronger runtime process isolation.
- model download hash verification if the desktop app manages models.
- memory/GPU/battery/temperature controls.
- clean-machine verification that resource controls behave correctly in the packaged app.

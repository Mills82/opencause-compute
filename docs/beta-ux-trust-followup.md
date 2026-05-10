# OpenCause Compute beta UX/trust follow-up plan

After the first hardening batch, keep UX work focused on volunteer trust rather than product expansion.

## 1. Preflight screen

Add a first-run and dashboard card answering: “Can this machine contribute comfortably?” Show CPU/load, idle state, battery/AC state, selected model installation, approximate RAM/disk footprint, expected time per packet for the selected mode, eligibility now, and the plain-language reason if blocked.

## 2. Structured activity timeline

Replace dashboard state derived from `worker.log` keywords with a structured local event journal. Events should include waiting for idle, checking runtime/model, claiming work, verifying signature, running local model, submitting, accepted, released/failed, paused, and blocked by battery/resource policy. Use it for dashboard, diagnostics, support bundles, and session stats; keep logs as redacted debug material only.

## 3. Safer profile setup

Do not expose full token URLs by default. Show profile setup as an available action, with an “Open profile setup” button and explicit “copy setup link” advanced action if needed. Add a “What data is stored on this computer?” drawer covering credentials, settings, logs, model files, and removal options.

## 4. Resource presets

Add Quiet, Balanced, Night Shift, and Power User presets. Each should explain fan noise, battery behavior, idle requirements, and when work will run. Keep advanced custom controls, but make the default beta posture conservative and honest.

## 5. Guided offboarding

Replace one-click local state removal with a guided main-process flow: remove credentials only, remove credentials and logs, remove all local OpenCause data, and optionally preserve/remove model files. Explain that re-enrollment may be required and that public profile/team data can remain server-side.

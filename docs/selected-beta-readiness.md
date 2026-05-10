# OpenCause Compute selected-beta readiness packet

_Last updated: 2026-05-10_

## Code-level hardening complete

The selected-beta hardening pass has addressed the major code-level blockers identified during audit:

- **Storage correctness:** production relational mutation paths now use targeted relational repositories instead of whole-state `withDb()` rewrites for worker, ingestion, enrollment, profile setup, gamification admin, public reports, and worker-control flows. Real Postgres integration tests run in CI.
- **Worker claim/release/fail lifecycle:** claimed work now terminates through submit, fail, or release. Non-worker-failure conditions such as resource changes use release semantics.
- **Secret redaction:** shared redaction covers logs, diagnostics, registration/debug output, setup URLs, tokens, auth headers, and support-style output paths.
- **Public/admin health split:** public health is minimal; detailed diagnostics moved behind admin auth.
- **Admin rate limits:** admin mutation routes use named rate limits, with inventory tests to catch regressions.
- **Electron IPC/sandbox hardening:** renderer uses `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`; IPC sender/origin and payloads are validated; destructive local-state removal requires main-process confirmation and path allowlisting.
- **Admin session hardening:** admin sessions are signed, rotating, expiring, and invalidated by UI password changes; UI password and API key behavior are separated in hosted mode.
- **Public report abuse controls:** reports require existing public targets, avoid enumeration, require Turnstile in hosted/production mode, use dedicated rate limits, and suppress duplicate spam.
- **Battery/resource enforcement and in-flight cancellation:** battery/idle/CPU policy is enforced before claim and during local generation; cancelled work releases claims rather than counting as worker failures.

## Remaining selected-beta gating item

The remaining selected-beta gate is a **fresh Windows packaged smoke test**. Code-level readiness is acceptable, but selected beta should not be declared until the packaged app is verified on a clean Windows profile.

## Windows packaged smoke-test checklist

Run this against a fresh Windows user profile or clean Windows VM using the packaged app, not dev mode.

1. **Install packaged app**
   - Install from the generated Windows package/installer.
   - Confirm install completes without warnings beyond expected unsigned-build warnings, if not yet signed.

2. **Launch outside dev mode**
   - Start from Start Menu / desktop shortcut / installed app path.
   - Confirm the app opens without terminal/dev server.

3. **Verify sandboxed preload bridge**
   - Dashboard loads current state.
   - Buttons/actions work: refresh, settings save, model checks, diagnostics.
   - No renderer/preload errors in logs.

4. **Register/enroll**
   - Use a valid enrollment code.
   - Confirm node registration succeeds.
   - Confirm enrollment code is not retained visibly after success.
   - Confirm profile setup is available without exposing full token URLs in logs/diagnostics.

5. **Start/pause/resume/stop/run-one**
   - Start worker loop.
   - Pause worker and verify worker stops/does not claim.
   - Resume worker.
   - Stop worker.
   - Trigger one contribution/run-now path.

6. **Verify claim → submit**
   - With AC power, idle/resource eligible state, and installed model, confirm a claimed packet submits successfully.
   - Confirm dashboard/timeline shows claim, generation, submit, accepted/submitted state.

7. **Verify claim → release**
   - Trigger a non-failure interruption after claim where feasible: pause, user activity, resource threshold, or battery transition.
   - Confirm claim is released, not failed.
   - Confirm timeline says the claim was released because policy changed.

8. **Verify battery/idle/CPU cancellation if feasible**
   - Battery: unplug laptop with `runOnBattery=false`; confirm preflight blocks work before claim.
   - Idle: move mouse/keyboard during generation if idle policy is enabled; confirm release.
   - CPU: temporarily lower max CPU threshold or create CPU load; confirm block/release.

9. **Verify logs/diagnostics contain no secrets**
   - Check worker logs, registration debug logs, diagnostics output, and any support-style copied output.
   - Confirm no node tokens, enrollment codes, profile setup tokens, auth headers, or tokenized setup URLs appear.

10. **Verify local-state removal safety**
    - Use the app’s local-state removal flow.
    - Confirm main-process confirmation appears.
    - Confirm only the intended OpenCause app data directory is removed.
    - Confirm unrelated user files and model files are not removed unless explicitly intended.

## Broader public-beta blockers

Before broad public beta, complete:

- **Code signing / installer trust:** signed Windows installer and verified publisher story.
- **Update/uninstall QA:** install, update, rollback, uninstall, startup-on-login cleanup, and local-state cleanup on clean Windows machines.
- **Fuller trust UX polish:** clearer preflight, guided offboarding, resource presets, and structured activity timeline as the primary user-facing status source.
- **Real-world abuse monitoring:** monitor reports, enrollment attempts, admin actions, node behavior, rate limits, and public profile/team moderation under real beta traffic.

## Recommendation

- **Selected beta:** yes, **after** the fresh Windows packaged smoke test passes.
- **Broad public beta:** no, not until signing, installer/update/uninstall QA, and real-world abuse monitoring are in place.

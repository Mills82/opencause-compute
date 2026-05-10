import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkerSupervisor, summarizeWorkerLog } from '../src/supervisor';

describe('worker supervisor contract', () => {
  const supervisor = new WorkerSupervisor({
    workerEntry: '/tmp/worker.js',
    appDir: '/tmp/opencause-worker',
    coordinatorUrl: 'https://opencause.appassist.ai',
    enrollmentCode: 'occ_test',
    nodeId: 'node-1',
    nodeToken: 'token-1'
  });

  it('builds register command with enrollment code', () => {
    expect(supervisor.buildArgs({ kind: 'register', enrollmentCode: 'occ_abc' })).toEqual([
      '/tmp/worker.js',
      'register',
      '--server',
      'https://opencause.appassist.ai',
      '--enrollment-code',
      'occ_abc'
    ]);
  });

  it('exposes register command execution for the desktop enrollment form', async () => {
    expect(typeof supervisor.register).toBe('function');
  });

  it('builds loop command with node credentials and interval', () => {
    expect(supervisor.buildArgs({ kind: 'loop', intervalMs: 10000 })).toEqual([
      '/tmp/worker.js',
      'loop',
      '--server',
      'https://opencause.appassist.ai',
      '--interval-ms',
      '10000',
      '--node-id',
      'node-1'
    ]);
  });

  it('passes desktop resource controls to worker loop arguments', () => {
    const controlled = new WorkerSupervisor({
      workerEntry: '/tmp/worker.js',
      appDir: '/tmp/opencause-worker',
      coordinatorUrl: 'https://opencause.appassist.ai',
      resourceControls: {
        idleMode: 'user-and-cpu',
        minIdleSeconds: 300,
        maxCpuPercent: 25,
        schedule: 'idle-only'
      }
    });

    expect(controlled.buildArgs({ kind: 'loop' })).toContain('--max-cpu-percent');
    expect(controlled.buildArgs({ kind: 'loop' })).toContain('25');
    expect(controlled.buildArgs({ kind: 'loop' })).toContain('--min-idle-seconds');
    expect(controlled.buildArgs({ kind: 'loop' })).toContain('300');
  });

  it('reports configured false when worker entry is missing', () => {
    expect(supervisor.status()).toMatchObject({ configured: false, registered: false, running: false });
  });

  it('reports registered when local worker credentials exist', async () => {
    const appDir = await mkdtemp(path.join(os.tmpdir(), 'occ-worker-registered-'));
    await writeFile(path.join(appDir, 'node.json'), '{}');
    const localSupervisor = new WorkerSupervisor({
      workerEntry: '/tmp/worker.js',
      appDir,
      coordinatorUrl: 'https://opencause.appassist.ai'
    });
    expect(localSupervisor.status().registered).toBe(true);
  });

  it('removes local worker state for uninstall cleanup', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'occ-worker-state-'));
    const appDir = path.join(parent, 'opencause-worker');
    await mkdir(appDir);
    await writeFile(path.join(appDir, 'node.json'), '{}');
    const localSupervisor = new WorkerSupervisor({
      workerEntry: '/tmp/worker.js',
      appDir,
      coordinatorUrl: 'https://opencause.appassist.ai'
    });

    const status = await localSupervisor.uninstallLocalState(parent);
    expect(status.running).toBe(false);
    expect(status.configured).toBe(false);
  });

  it('rejects unsafe local-state removal paths', async () => {
    const localSupervisor = new WorkerSupervisor({
      workerEntry: '/tmp/worker.js',
      appDir: os.tmpdir(),
      coordinatorUrl: 'https://opencause.appassist.ai'
    });

    await expect(localSupervisor.uninstallLocalState(os.tmpdir())).rejects.toThrow('unsafe_uninstall_path');
  });

  it('summarizes a claimed packet running through local model extraction', () => {
    const summary = summarizeWorkerLog('[2026-05-10T01:45:00.882Z] claimed packet packet-1\n[2026-05-10T01:45:00.883Z] signature verified for packet packet-1\n');
    expect(summary).toMatchObject({ state: 'running_model', severity: 'ready', packetId: 'packet-1' });
  });

  it('summarizes local model timeout failures clearly', () => {
    const summary = summarizeWorkerLog('[2026-05-10T01:45:00.882Z] claimed packet packet-1\n[2026-05-10T01:48:00.883Z] run failed local_llm_timeout:180000\n');
    expect(summary).toMatchObject({ state: 'failed', severity: 'blocked', error: 'local_llm_timeout:180000' });
    expect(summary.headline).toContain('timed out');
  });

  it('treats idle gate blocks as waiting, not errors', () => {
    const summary = summarizeWorkerLog('[2026-05-10T01:45:00.882Z] run failed local_llm_invalid_json\n[2026-05-10T01:48:00.883Z] idle gate blocked extraction reason=user_not_idle cpu=11% userIdle=4s\n');
    expect(summary).toMatchObject({ state: 'waiting_idle', severity: 'warning' });
  });

  it('summarizes reported claim failures as skipped packets', () => {
    const summary = summarizeWorkerLog('[2026-05-10T01:45:00.882Z] claimed packet packet-1\n[2026-05-10T01:46:00.883Z] reported failed claim packet packet-1 reason=local_llm_invalid_json\n');
    expect(summary).toMatchObject({ state: 'failed', severity: 'warning', packetId: 'packet-1' });
    expect(summary.headline).toContain('Skipped');
  });
});

import { buildActivityTimeline } from '../src/supervisor';

describe('structured activity timeline', () => {
  it('turns worker log lines into structured timeline events', () => {
    const events = buildActivityTimeline('[2026-05-10T01:00:00.000Z] claimed packet packet-1\n[2026-05-10T01:01:00.000Z] submitted result result-1 validated=true\n');
    expect(events[0]).toMatchObject({ kind: 'submitting_result', severity: 'ready' });
    expect(events[1]).toMatchObject({ kind: 'claiming_work', severity: 'ready' });
  });
});

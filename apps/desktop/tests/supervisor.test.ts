import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkerSupervisor } from '../src/supervisor';

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
      'node-1',
      '--node-token',
      'token-1'
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
    const appDir = await mkdtemp(path.join(os.tmpdir(), 'occ-worker-state-'));
    await writeFile(path.join(appDir, 'node.json'), '{}');
    const localSupervisor = new WorkerSupervisor({
      workerEntry: '/tmp/worker.js',
      appDir,
      coordinatorUrl: 'https://opencause.appassist.ai'
    });

    const status = await localSupervisor.uninstallLocalState();
    expect(status.running).toBe(false);
    expect(status.configured).toBe(false);
  });
});

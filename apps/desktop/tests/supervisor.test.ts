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

  it('reports configured false when worker entry is missing', () => {
    expect(supervisor.status()).toMatchObject({ configured: false, running: false });
  });
});

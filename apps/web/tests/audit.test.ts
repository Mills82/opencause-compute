import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { claimWork, registerNode, seedDemoData, triggerRunNow, updateWorkerControl } from '../lib/coordinator';

function emptyDb(): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
    ingestionRuns: [],
    auditEvents: [],
    workerControl: {
      paused: false,
      idleMode: 'user-and-cpu',
      minIdleSeconds: 120,
      maxCpuPercent: 35,
      runNowToken: 0,
      updatedAt: new Date().toISOString()
    }
  };
}

describe('audit events', () => {
  it('records node registration, claim, and worker-control events', () => {
    const db = emptyDb();
    seedDemoData(db);
    const node = registerNode(db, { nodeName: 'n', platform: 'linux', version: '0.1.0', capabilities: [] });
    claimWork(db, node.id);
    updateWorkerControl(db, { paused: true });
    triggerRunNow(db);

    expect(db.auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'node.registered',
        'work.claim.created',
        'worker_control.updated',
        'worker_control.run_now'
      ])
    );
  });
});

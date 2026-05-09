import { describe, expect, it } from 'vitest';
import {
  claimWork,
  getWorkerControl,
  heartbeatNode,
  registerNode,
  seedDemoData,
  submitResult,
  triggerRunNow,
  updateWorkerControl
} from '../lib/coordinator';
import type { DatabaseState } from '@opencause/shared';
import { runMockExtractorV1 } from '@opencause/shared';

function emptyDb(): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
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

describe('claim/submit flow', () => {
  it('claims packet and submits validated result', () => {
    const db = emptyDb();
    seedDemoData(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const claim = claimWork(db, node.id);
    expect(claim).not.toBeNull();

    if (!claim) {
      throw new Error('Expected claim');
    }

    const result = runMockExtractorV1(claim.packet.sourceText);
    const submitted = submitResult(db, {
      nodeId: node.id,
      claimId: claim.claimId,
      workPacketId: claim.packet.id,
      extractorVersion: 'Local LLM v1',
      result
    });

    expect(submitted.record.validated).toBe(true);
    expect(db.results).toHaveLength(1);
    expect(db.facts.length).toBeGreaterThan(0);
  });

  it('returns same active claim for repeated claims by the same node', () => {
    const db = emptyDb();
    seedDemoData(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const firstClaim = claimWork(db, node.id);
    const secondClaim = claimWork(db, node.id);

    expect(firstClaim).not.toBeNull();
    expect(secondClaim).not.toBeNull();
    expect(firstClaim?.claimId).toBe(secondClaim?.claimId);
    expect(db.claims).toHaveLength(1);
  });

  it('reclaims expired claims and requeues packet', () => {
    const db = emptyDb();
    seedDemoData(db);
    const nodeA = registerNode(db, {
      nodeName: 'node-a',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });
    const nodeB = registerNode(db, {
      nodeName: 'node-b',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const firstClaim = claimWork(db, nodeA.id);
    expect(firstClaim).not.toBeNull();
    if (!firstClaim) {
      throw new Error('Expected first claim');
    }

    const claimRecord = db.claims.find((claim) => claim.id === firstClaim.claimId);
    if (!claimRecord) {
      throw new Error('Expected claim record');
    }
    claimRecord.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();

    const secondClaim = claimWork(db, nodeB.id);
    expect(secondClaim).not.toBeNull();
    expect(secondClaim?.packet.id).toBe(firstClaim.packet.id);

    const updatedFirst = db.claims.find((claim) => claim.id === firstClaim.claimId);
    expect(updatedFirst?.status).toBe('expired');
  });

  it('rejects submit for an expired claim', () => {
    const db = emptyDb();
    seedDemoData(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const claim = claimWork(db, node.id);
    expect(claim).not.toBeNull();
    if (!claim) {
      throw new Error('Expected claim');
    }

    const claimRecord = db.claims.find((entry) => entry.id === claim.claimId);
    if (!claimRecord) {
      throw new Error('Expected claim record');
    }
    claimRecord.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();

    const result = runMockExtractorV1(claim.packet.sourceText);
    expect(() =>
      submitResult(db, {
        nodeId: node.id,
        claimId: claim.claimId,
        workPacketId: claim.packet.id,
        extractorVersion: 'Local LLM v1',
        result
      })
    ).toThrowError('claim_expired');
  });

  it('extends active lease on heartbeat', () => {
    const db = emptyDb();
    seedDemoData(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const claim = claimWork(db, node.id);
    expect(claim).not.toBeNull();
    if (!claim) {
      throw new Error('Expected claim');
    }

    const claimRecord = db.claims.find((entry) => entry.id === claim.claimId);
    if (!claimRecord) {
      throw new Error('Expected claim record');
    }
    claimRecord.leaseExpiresAt = new Date(Date.now() + 1_000).toISOString();

    heartbeatNode(db, node.id);

    const extendedClaim = db.claims.find((entry) => entry.id === claim.claimId);
    expect(extendedClaim).toBeDefined();
    expect(new Date(extendedClaim!.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now() + 5 * 60_000);
  });

  it('marks stale node offline and reclaims its claim', () => {
    const db = emptyDb();
    seedDemoData(db);
    const nodeA = registerNode(db, {
      nodeName: 'node-a',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });
    const nodeB = registerNode(db, {
      nodeName: 'node-b',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['mock-extractor-v1']
    });

    const firstClaim = claimWork(db, nodeA.id);
    expect(firstClaim).not.toBeNull();
    if (!firstClaim) {
      throw new Error('Expected first claim');
    }

    const staleNodeA = db.nodes.find((node) => node.id === nodeA.id);
    if (!staleNodeA) {
      throw new Error('Expected stale node');
    }
    staleNodeA.lastHeartbeatAt = new Date(Date.now() - 10 * 60_000).toISOString();

    const secondClaim = claimWork(db, nodeB.id);
    expect(secondClaim).not.toBeNull();
    expect(secondClaim?.packet.id).toBe(firstClaim.packet.id);

    const firstClaimRecord = db.claims.find((entry) => entry.id === firstClaim.claimId);
    expect(firstClaimRecord?.status).toBe('expired');

    const refreshedNodeA = db.nodes.find((node) => node.id === nodeA.id);
    expect(refreshedNodeA?.status).toBe('offline');
  });

  it('updates worker controls and run-now token', () => {
    const db = emptyDb();
    const before = getWorkerControl(db);
    expect(before.paused).toBe(false);
    expect(before.runNowToken).toBe(0);

    updateWorkerControl(db, { paused: true, idleMode: 'cpu-only', maxCpuPercent: 55, minIdleSeconds: 0 });
    const afterUpdate = getWorkerControl(db);
    expect(afterUpdate.paused).toBe(true);
    expect(afterUpdate.idleMode).toBe('cpu-only');
    expect(afterUpdate.maxCpuPercent).toBe(55);
    expect(afterUpdate.minIdleSeconds).toBe(0);

    triggerRunNow(db);
    const afterRunNow = getWorkerControl(db);
    expect(afterRunNow.runNowToken).toBe(1);
  });
});

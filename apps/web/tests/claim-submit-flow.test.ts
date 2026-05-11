import { describe, expect, it } from 'vitest';
import {
  claimWork,
  getWorkerControl,
  heartbeatNode,
  registerNode,
  releaseClaim,
  seedDemoData,
  submitResult,
  triggerRunNow,
  updateWorkerControl
} from '../lib/coordinator';
import type { DatabaseState } from '@opencause/shared';
import { runMockExtractorV1 } from '@opencause/shared';
import { signWorkPacketPayload } from '../lib/signing';

function emptyDb(): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
    extractedClaims: [],
    ingestionRuns: [],
    auditEvents: [],
    volunteerEnrollments: [],
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

function forceLegacyLocalPackets(db: DatabaseState): void {
  for (const packet of db.workPackets) {
    packet.extractor = 'local-llm-v1';
    const payload = {
      id: packet.id,
      projectId: packet.projectId,
      title: packet.title,
      sourceText: packet.sourceText,
      sourceCitation: packet.sourceCitation,
      sourceUrl: packet.sourceUrl,
      sourcePublishedAt: packet.sourcePublishedAt,
      sectionTitle: packet.sectionTitle,
      sectionType: packet.sectionType,
      paragraphIndex: packet.paragraphIndex,
      inputHash: packet.inputHash,
      extractor: packet.extractor,
      createdAt: packet.createdAt
    };
    packet.signature = signWorkPacketPayload(payload);
  }
}

describe('claim/submit flow', () => {

  it('quarantines invalid packet signatures instead of serving them', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const node = registerNode(db, { nodeName: 'test-node', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });
    const firstQueued = db.workPackets.find((packet) => packet.status === 'queued');
    expect(firstQueued).toBeTruthy();
    if (!firstQueued) throw new Error('Expected packet');
    firstQueued.signature = signWorkPacketPayload({ bad: 'payload' });

    const claim = claimWork(db, node.id);

    expect(db.workPackets.find((packet) => packet.id === firstQueued.id)?.status).toBe('invalid_signature');
    expect(claim?.packet.id).not.toBe(firstQueued.id);
    expect(db.auditEvents.some((event) => event.action === 'work.packet.invalid_signature_quarantined')).toBe(true);
  });

  it('claims packet and submits validated result', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
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
    forceLegacyLocalPackets(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
    });

    const firstClaim = claimWork(db, node.id);
    const secondClaim = claimWork(db, node.id);

    expect(firstClaim).not.toBeNull();
    expect(secondClaim).not.toBeNull();
    expect(firstClaim?.claimId).toBe(secondClaim?.claimId);
    expect(db.claims).toHaveLength(1);
  });


  it('releases a claimed packet without recording worker failure semantics', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const node = registerNode(db, { nodeName: 'test-node', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });
    const claim = claimWork(db, node.id);
    expect(claim).not.toBeNull();
    if (!claim) throw new Error('Expected claim');

    releaseClaim(db, { nodeId: node.id, claimId: claim.claimId, workPacketId: claim.packet.id, reason: 'user_not_idle' });

    expect(db.claims.find((candidate) => candidate.id === claim.claimId)?.status).toBe('released');
    expect(db.workPackets.find((packet) => packet.id === claim.packet.id)?.status).toBe('queued');
    expect(db.auditEvents.some((event) => event.action === 'work.claim.released')).toBe(true);
  });

  it('reclaims expired claims and requeues packet', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const nodeA = registerNode(db, {
      nodeName: 'node-a',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
    });
    const nodeB = registerNode(db, {
      nodeName: 'node-b',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
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
    forceLegacyLocalPackets(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
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
    forceLegacyLocalPackets(db);
    const node = registerNode(db, {
      nodeName: 'test-node',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
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
    forceLegacyLocalPackets(db);
    const nodeA = registerNode(db, {
      nodeName: 'node-a',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
    });
    const nodeB = registerNode(db, {
      nodeName: 'node-b',
      platform: 'linux',
      version: '0.1.0',
      capabilities: ['local-llm-v1', 'mock-extractor-v1']
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

  it('keeps first valid submission consensus pending and requeues for independent duplicate work', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const nodeA = registerNode(db, { nodeName: 'node-a', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });
    const nodeB = registerNode(db, { nodeName: 'node-b', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });

    const firstClaim = claimWork(db, nodeA.id);
    if (!firstClaim) throw new Error('Expected first claim');
    const firstResult = submitResult(db, {
      nodeId: nodeA.id,
      claimId: firstClaim.claimId,
      workPacketId: firstClaim.packet.id,
      extractorVersion: 'Local LLM v1',
      result: runMockExtractorV1(firstClaim.packet.sourceText)
    });

    expect(firstResult.record.consensusStatus).toBe('consensus_pending');
    expect(firstResult.workPacket.status).toBe('queued');

    const repeatSameNode = claimWork(db, nodeA.id);
    expect(repeatSameNode?.packet.id).not.toBe(firstClaim.packet.id);

    const secondClaim = claimWork(db, nodeB.id);
    expect(secondClaim?.packet.id).toBe(firstClaim.packet.id);
  });

  it('marks matching independent duplicate submissions consensus passed', () => {
    const db = emptyDb();
    seedDemoData(db);
    forceLegacyLocalPackets(db);
    const nodeA = registerNode(db, { nodeName: 'node-a', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });
    const nodeB = registerNode(db, { nodeName: 'node-b', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v1', 'mock-extractor-v1'] });

    const firstClaim = claimWork(db, nodeA.id);
    if (!firstClaim) throw new Error('Expected first claim');
    submitResult(db, {
      nodeId: nodeA.id,
      claimId: firstClaim.claimId,
      workPacketId: firstClaim.packet.id,
      extractorVersion: 'Local LLM v1',
      result: runMockExtractorV1(firstClaim.packet.sourceText)
    });

    const secondClaim = claimWork(db, nodeB.id);
    if (!secondClaim) throw new Error('Expected second claim');
    const secondResult = submitResult(db, {
      nodeId: nodeB.id,
      claimId: secondClaim.claimId,
      workPacketId: secondClaim.packet.id,
      extractorVersion: 'Local LLM v1',
      result: runMockExtractorV1(secondClaim.packet.sourceText)
    });

    expect(secondResult.workPacket.status).toBe('completed');
    expect(db.results.filter((result) => result.workPacketId === firstClaim.packet.id).map((result) => result.consensusStatus)).toEqual([
      'consensus_passed',
      'consensus_passed'
    ]);
  });

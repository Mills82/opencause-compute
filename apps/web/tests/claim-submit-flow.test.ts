import { describe, expect, it } from 'vitest';
import {
  claimWork,
  registerNode,
  seedDemoData,
  submitResult
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
    facts: []
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
      result
    });

    expect(submitted.record.validated).toBe(true);
    expect(db.results).toHaveLength(1);
    expect(db.facts.length).toBeGreaterThan(0);
  });
});

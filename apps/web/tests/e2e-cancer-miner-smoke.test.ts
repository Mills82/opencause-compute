import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { claimWork, createWorkPacketsFromSources, getOrCreateProject, registerNode, submitResult } from '../lib/coordinator';
import { listEvidenceCards } from '../lib/evidence-cards';
import { normalizeLocalLlmV2Payload } from '../../../apps/worker/src/local-llm';

function db(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], extractedClaims: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: new Date().toISOString() }
  };
}

describe('Cancer Knowledge Miner e2e smoke', () => {
  it('ingests oncology PMC chunks, accepts claims-v2 from lite.1 worker output, exports evidence cards, and attempts consensus', () => {
    const state = db();
    const project = getOrCreateProject(state, { slug: 'cancer-knowledge-miner', name: 'Cancer Knowledge Miner', description: 'test' });
    const sentence = 'Radiotherapy significantly improved local control in lung cancer patients.';
    const ingested = createWorkPacketsFromSources(state, {
      projectId: project.id,
      sources: [{ title: 'PMC oncology chunk', sourceText: sentence, sourceCitation: 'PMC smoke citation', sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC-smoke/' }]
    });
    expect(ingested.packetsCreated).toBe(1);

    const nodeA = registerNode(state, { nodeName: 'a', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v2'] });
    const firstClaim = claimWork(state, nodeA.id)!;
    const liteOutput = { schemaVersion: 'claims-v2-lite.1', claims: [{ evidenceSentence: sentence, claimLabel: 'local_control', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'increased', confidence: 0.82 }], warnings: [] };
    const canonical = normalizeLocalLlmV2Payload(liteOutput, firstClaim.packet.sourceText, { title: firstClaim.packet.title, sourceCitation: firstClaim.packet.sourceCitation });
    const firstSubmit = submitResult(state, { nodeId: nodeA.id, claimId: firstClaim.claimId, workPacketId: firstClaim.packet.id, extractorVersion: 'Local LLM v2', result: canonical });
    expect(firstSubmit.claims[0]?.claimType).toBe('local_control');
    expect(state.extractedClaims).toHaveLength(1);
    expect(firstSubmit.workPacket.status).toBe('queued');

    const cards = listEvidenceCards(state);
    expect(cards[0]?.claim.type).toBe('local_control');
    expect(cards[0]?.source.url).toContain('PMC-smoke');
    expect(cards[0]?.fingerprints.normalizedClaimFingerprint).toHaveLength(64);

    const nodeB = registerNode(state, { nodeName: 'b', platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v2'] });
    const secondClaim = claimWork(state, nodeB.id)!;
    const secondSubmit = submitResult(state, { nodeId: nodeB.id, claimId: secondClaim.claimId, workPacketId: secondClaim.packet.id, extractorVersion: 'Local LLM v2', result: canonical });
    expect(secondSubmit.record.consensusStatus).toBe('consensus_passed');
    expect(secondSubmit.workPacket.status).toBe('completed');
  });
});

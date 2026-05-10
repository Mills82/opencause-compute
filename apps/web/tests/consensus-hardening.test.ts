import { describe, expect, it } from 'vitest';
import type { DatabaseState, ExtractionResult, ExtractedFactRecord } from '@opencause/shared';
import { updateConsensusForPacket } from '../lib/consensus';

function db(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [], volunteerProfileNodes: [], teams: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [], impactDigests: [], impactCards: [], projectCorpusEstimates: [], publicReports: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: new Date().toISOString() }
  };
}

function result(id: string, nodeId: string): ExtractionResult {
  return { id, workPacketId: 'packet-1', nodeId, claimId: `claim-${id}`, extractorVersion: 'Local LLM v1', resultHash: id, validated: true, formatValidated: true, consensusStatus: 'consensus_pending', reviewStatus: 'not_reviewed', validationErrors: [], warnings: [], summary: 'ok', submittedAt: new Date().toISOString(), provenance: { workerVersion: '0.1.0', extractorVersion: 'Local LLM v1', modelName: 'm', modelProvider: 'ollama', promptVersion: 'p', promptHash: 'h', packetSchemaVersion: 'work-packet-v1', extractionTimestamp: new Date().toISOString(), generationQualityTier: 'balanced', workerPlatform: 'linux', workerCapabilities: [], resultValidationVersion: 'format-validation-v1' } };
}

function fact(id: string, resultId: string): ExtractedFactRecord {
  return { id, resultId, relationshipType: 'associated_with', cancerType: 'NSCLC', geneOrBiomarker: 'EGFR', drugOrCompound: 'osimertinib', evidenceSentence: 'EGFR associated with response.', confidence: 0.8, sourceCitation: 'src', sourceUrl: 'https://example.com' };
}

describe('consensus hardening', () => {
  it('counts same-tier independent workers separately', () => {
    const state = db();
    state.results.push(result('r1', 'n1'), result('r2', 'n2'), result('r3', 'n3'));
    state.facts.push(fact('f1', 'r1'), fact('f2', 'r2'), fact('f3', 'r3'));
    expect(updateConsensusForPacket(state, 'packet-1')).toBe('consensus_passed');
  });
});

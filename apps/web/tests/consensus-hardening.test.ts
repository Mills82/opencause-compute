import { describe, expect, it } from 'vitest';
import type { DatabaseState, ExtractedClaimRecord, ExtractionResult } from '@opencause/shared';
import { consensusClaimKey, updateConsensusForPacket } from '../lib/consensus';

function db(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], extractedClaims: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [], volunteerProfileNodes: [], teams: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [], impactDigests: [], impactCards: [], projectCorpusEstimates: [], publicReports: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: new Date().toISOString() }
  };
}

function result(id: string, nodeId: string): ExtractionResult {
  return { id, workPacketId: 'packet-1', nodeId, claimId: `claim-${id}`, extractorVersion: 'Local LLM v2', resultHash: id, validated: true, formatValidated: true, consensusStatus: 'consensus_pending', reviewStatus: 'not_reviewed', validationErrors: [], warnings: [], summary: 'ok', submittedAt: new Date().toISOString(), provenance: { workerVersion: '0.1.0', extractorVersion: 'Local LLM v2', modelName: 'qwen3:14b', modelProvider: 'ollama', promptVersion: 'p', promptHash: 'h', packetSchemaVersion: 'work-packet-v1', extractionTimestamp: new Date().toISOString(), generationQualityTier: 'balanced', workerPlatform: 'linux', workerCapabilities: [], resultValidationVersion: 'claims-v2' } };
}

function claim(id: string, resultId: string, sentence = 'EGFR was associated with response in lung cancer patients.'): ExtractedClaimRecord {
  return { id, resultId, claimType: 'treatment_response', evidenceOrigin: 'this_study_result', evidenceType: 'clinical', studyContext: 'human_cohort', polarity: 'affirmed', direction: 'associated', cancerType: 'lung cancer', biomarkerMention: 'EGFR', drugOrInterventionMention: 'osimertinib', outcomeMention: 'response', exactEvidenceSentence: sentence, confidence: 0.8, sourceCitation: 'src', sourceUrl: 'https://example.com' };
}

describe('consensus hardening', () => {
  it('counts same-tier independent workers separately', () => {
    const state = db();
    state.results.push(result('r1', 'n1'), result('r2', 'n2'), result('r3', 'n3'));
    state.extractedClaims.push(claim('c1', 'r1'), claim('c2', 'r2'), claim('c3', 'r3'));
    expect(updateConsensusForPacket(state, 'packet-1')).toBe('consensus_passed');
  });

  it('normalizes consensus fingerprints across punctuation and case', () => {
    expect(consensusClaimKey(claim('c1', 'r1'))).toBe(consensusClaimKey(claim('c2', 'r2', 'egfr was associated with response in lung cancer patients')));
  });
});

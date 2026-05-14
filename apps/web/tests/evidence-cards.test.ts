import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { listEvidenceCards, normalizedClaimFingerprint } from '../lib/evidence-cards';

const now = new Date().toISOString();

function state(): DatabaseState {
  return {
    projects: [],
    workPackets: [{ id: 'p1', projectId: 'proj', title: 'Trial', sourceText: 'Grade 3 toxicity occurred in 12% of patients.', sourceCitation: 'Citation', sourceUrl: 'https://example.com', inputHash: 'h', extractor: 'local-llm-v2', signature: 's', status: 'completed', createdAt: now, updatedAt: now }],
    nodes: [], claims: [],
    results: [{ id: 'r1', workPacketId: 'p1', nodeId: 'n1', claimId: 'wc1', extractorVersion: 'Local LLM v2', resultHash: 'rh', validated: true, formatValidated: true, consensusStatus: 'consensus_pending', reviewStatus: 'not_reviewed', validationErrors: [], warnings: [], summary: 'one', submittedAt: now, provenance: { workerVersion: '0.1.0', extractorVersion: 'Local LLM v2', modelName: 'qwen3:14b', modelProvider: 'ollama', promptVersion: 'local-llm-v2-lite.1-prompt-2026-05-14a', promptHash: 'hash', packetSchemaVersion: 'work-packet-v1', extractionTimestamp: now, workerPlatform: 'linux', workerCapabilities: ['local-llm-v2'], resultValidationVersion: 'claims-v2' } }],
    extractedClaims: [{ id: 'c1', resultId: 'r1', claimType: 'toxicity', evidenceOrigin: 'this_study_result', evidenceType: 'clinical', studyContext: 'human_cohort', polarity: 'affirmed', direction: 'associated', exactEvidenceSentence: 'Grade 3 toxicity occurred in 12% of patients.', confidence: 0.8, sourceCitation: 'Citation', sourceUrl: 'https://example.com' }],
    ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: now }
  };
}

describe('evidence cards', () => {
  it('exports LLM-friendly evidence cards with quality and fingerprints', () => {
    const cards = listEvidenceCards(state());
    expect(cards[0]?.claim.type).toBe('toxicity');
    expect(cards[0]?.evidence.sentence).toContain('Grade 3 toxicity');
    expect(cards[0]?.quality.modelName).toBe('qwen3:14b');
    expect(cards[0]?.fingerprints.normalizedClaimFingerprint).toHaveLength(64);
  });

  it('normalizes claim fingerprints', () => {
    const db = state();
    const a = db.extractedClaims[0]!;
    const b = { ...a, exactEvidenceSentence: 'grade 3 toxicity occurred in 12% of patients' };
    expect(normalizedClaimFingerprint(a)).toBe(normalizedClaimFingerprint(b));
  });
});

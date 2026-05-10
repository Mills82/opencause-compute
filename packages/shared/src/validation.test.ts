import { describe, expect, it } from 'vitest';
import { validateResultForPacket } from './validation.js';
import type { WorkPacketPayload } from './types.js';

const packet: WorkPacketPayload = {
  id: 'p1',
  projectId: 'proj1',
  title: 'Packet',
  sourceText: 'EGFR response was observed in lung cancer patients.',
  sourceCitation: 'Demo Citation',
  sourceUrl: 'https://example.org/paper',
  inputHash: 'hash',
  extractor: 'mock-extractor-v1',
  createdAt: new Date().toISOString()
};

describe('result validation', () => {
  it('accepts valid evidence sentence', () => {
    const result = {
      facts: [
        {
          relationshipType: 'associated_with_response',
          evidenceSentence: 'EGFR response was observed in lung cancer patients.',
          confidence: 0.7
        }
      ],
      summary: 'ok',
      warnings: []
    };

    const validated = validateResultForPacket(result, packet);
    expect(validated.valid).toBe(true);
  });

  it('rejects evidence not present in source', () => {
    const result = {
      facts: [
        {
          relationshipType: 'associated_with_response',
          evidenceSentence: 'Not in source',
          confidence: 0.7
        }
      ],
      summary: 'ok',
      warnings: []
    };

    const validated = validateResultForPacket(result, packet);
    expect(validated.valid).toBe(false);
  });

  it('does not reject claims-v2 submissions for invalid optional character offsets', () => {
    const result = {
      schemaVersion: 'claims-v2',
      claims: [
        {
          claimType: 'treatment_response',
          evidenceOrigin: 'this_study_result',
          evidenceType: 'clinical',
          studyContext: 'human_cohort',
          polarity: 'affirmed',
          direction: 'associated',
          exactEvidenceSentence: 'EGFR response was observed in lung cancer patients.',
          charStart: 0,
          charEnd: 0,
          confidence: 0.7
        }
      ],
      summary: 'ok',
      warnings: []
    };

    const validated = validateResultForPacket(result, packet);
    expect(validated.valid).toBe(true);
  });
});

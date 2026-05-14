import { describe, expect, it } from 'vitest';
import { claimTypeSchema, resultPayloadSchema, resultPayloadV2Lite1Schema } from './types.js';

describe('claims-v2 schemas', () => {
  it('accepts toxicity and local_control claim types', () => {
    expect(claimTypeSchema.parse('toxicity')).toBe('toxicity');
    expect(claimTypeSchema.parse('local_control')).toBe('local_control');
  });

  it('parses canonical claims-v2 payloads', () => {
    const parsed = resultPayloadSchema.parse({
      schemaVersion: 'claims-v2',
      claims: [{
        claimType: 'toxicity',
        evidenceOrigin: 'this_study_result',
        evidenceType: 'clinical',
        studyContext: 'human_cohort',
        polarity: 'affirmed',
        direction: 'associated',
        exactEvidenceSentence: 'Grade 3 toxicity occurred in 12% of patients.',
        confidence: 0.8
      }],
      summary: 'one candidate evidence record',
      warnings: [],
      diagnostics: [{ code: 'claim_rejected:duplicate_evidence_sentence', severity: 'warning' }]
    });
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.diagnostics?.[0]?.code).toContain('claim_rejected');
  });

  it('parses claims-v2-lite.1 model output without summaries', () => {
    const parsed = resultPayloadV2Lite1Schema.parse({
      schemaVersion: 'claims-v2-lite.1',
      claims: [{
        evidenceSentence: 'Local control improved after radiotherapy.',
        claimLabel: 'local_control',
        evidenceRole: 'this_study_result',
        evidenceModality: 'clinical',
        effect: 'increased',
        confidence: 0.76
      }],
      warnings: []
    });
    expect(parsed.claims[0]?.claimLabel).toBe('local_control');
  });
});

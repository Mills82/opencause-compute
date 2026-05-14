import { describe, expect, it } from 'vitest';
import { normalizeLocalLlmV2Payload } from '../src/local-llm';

describe('worker smoke', () => {
  it('can normalize claims-v2-lite.1 output locally', () => {
    const result = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.1',
      claims: [{ evidenceSentence: 'Radiotherapy significantly improved local control in lung cancer patients.', claimLabel: 'local_control', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'increased', confidence: 0.8 }],
      warnings: []
    }, 'Radiotherapy significantly improved local control in lung cancer patients.');
    expect(result.claims[0]?.claimType).toBe('local_control');
  });
});

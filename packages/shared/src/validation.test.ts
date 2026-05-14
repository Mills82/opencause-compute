import { describe, expect, it } from 'vitest';
import { validateResultForPacket } from './validation.js';
import type { ResultPayload, WorkPacketPayload } from './types.js';

const packet: WorkPacketPayload = {
  id: 'p1',
  projectId: 'proj1',
  title: 'Packet',
  sourceText: 'EGFR response was observed in lung cancer patients. Local control improved after radiotherapy. Grade 3 toxicity occurred in 12% of patients.',
  sourceCitation: 'Demo Citation',
  sourceUrl: 'https://example.org/paper',
  inputHash: 'hash',
  extractor: 'local-llm-v2',
  createdAt: new Date().toISOString()
};

function claim(sentence: string, claimType: ResultPayload['claims'][number]['claimType'] = 'treatment_response'): ResultPayload['claims'][number] {
  return {
    claimType,
    evidenceOrigin: 'this_study_result',
    evidenceType: 'clinical',
    studyContext: 'human_cohort',
    polarity: 'affirmed',
    direction: 'associated',
    exactEvidenceSentence: sentence,
    confidence: 0.7
  };
}

describe('result validation', () => {
  it('accepts valid claims-v2 evidence sentences', () => {
    const result: ResultPayload = { schemaVersion: 'claims-v2', claims: [claim('EGFR response was observed in lung cancer patients.')], summary: 'ok', warnings: [] };
    expect(validateResultForPacket(result, packet).valid).toBe(true);
  });

  it('rejects claims whose exact evidence is not present in source', () => {
    const result: ResultPayload = { schemaVersion: 'claims-v2', claims: [claim('Not in source')], summary: 'ok', warnings: [] };
    expect(validateResultForPacket(result, packet).valid).toBe(false);
  });

  it('accepts toxicity and local-control claim types', () => {
    const result: ResultPayload = {
      schemaVersion: 'claims-v2',
      claims: [claim('Grade 3 toxicity occurred in 12% of patients.', 'toxicity'), claim('Local control improved after radiotherapy.', 'local_control')],
      summary: 'ok',
      warnings: []
    };
    expect(validateResultForPacket(result, packet).valid).toBe(true);
  });
});

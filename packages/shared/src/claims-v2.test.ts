import { describe, expect, it } from 'vitest';
import { resultPayloadV2Schema } from './types.js';
import { validateResultForPacket } from './validation.js';
import type { ExtractedClaim, WorkPacketPayload } from './types.js';

const sourceText = [
  'In this human cohort, EGFR mutation was associated with improved response to osimertinib in lung cancer.',
  'PD-L1 expression was not associated with overall survival.',
  'Cells were treated with gefitinib for 24 hours.',
  'These findings may suggest that KRAS alters resistance pathways.'
].join(' ');

const packet: WorkPacketPayload = {
  id: 'p1',
  projectId: 'proj1',
  title: 'Packet',
  sourceText,
  sourceCitation: 'Demo Citation',
  sourceUrl: 'https://example.org/paper',
  inputHash: 'hash',
  extractor: 'local-llm-v2',
  createdAt: new Date().toISOString()
};

function baseClaim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    claimType: 'treatment_response',
    evidenceOrigin: 'this_study_result',
    evidenceType: 'clinical',
    studyContext: 'human_cohort',
    polarity: 'affirmed',
    direction: 'associated',
    cancerType: 'lung cancer',
    biomarkerMention: 'EGFR mutation',
    biomarkerNormalizedGuess: 'EGFR',
    drugOrInterventionMention: 'osimertinib',
    drugNormalizedGuess: 'osimertinib',
    exactEvidenceSentence: 'In this human cohort, EGFR mutation was associated with improved response to osimertinib in lung cancer.',
    confidence: 0.82,
    ...overrides
  };
}

describe('claims-v2 schema and validation', () => {
  it('accepts no-claim packets with a reason', () => {
    expect(resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [], noClaimReason: 'no_cancer_claim', summary: 'No claims.', warnings: [] }).claims).toEqual([]);
  });

  it('supports background and prior-work claims', () => {
    const parsed = resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ evidenceOrigin: 'cited_prior_work' })], summary: 'ok', warnings: [] });
    expect(parsed.claims[0].evidenceOrigin).toBe('cited_prior_work');
  });

  it('supports methods-only labels without making them invalid', () => {
    const parsed = resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ evidenceOrigin: 'methods_only', exactEvidenceSentence: 'Cells were treated with gefitinib for 24 hours.', drugOrInterventionMention: 'gefitinib' })], summary: 'ok', warnings: [] });
    expect(parsed.claims[0].evidenceOrigin).toBe('methods_only');
  });

  it('supports negated no-association claims', () => {
    const parsed = resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ claimType: 'prognosis', polarity: 'negated', direction: 'no_association', biomarkerMention: 'PD-L1 expression', exactEvidenceSentence: 'PD-L1 expression was not associated with overall survival.' })], summary: 'ok', warnings: [] });
    expect(parsed.claims[0].polarity).toBe('negated');
    expect(parsed.claims[0].direction).toBe('no_association');
  });

  it('supports speculative claims', () => {
    const parsed = resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ evidenceOrigin: 'hypothesis_or_speculation', polarity: 'speculative', biomarkerMention: 'KRAS', exactEvidenceSentence: 'These findings may suggest that KRAS alters resistance pathways.' })], summary: 'ok', warnings: [] });
    expect(parsed.claims[0].polarity).toBe('speculative');
  });

  it('supports clinical and preclinical contexts', () => {
    expect(resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ evidenceType: 'preclinical', studyContext: 'cell_line' })], summary: 'ok', warnings: [] }).claims[0].studyContext).toBe('cell_line');
  });

  it('supports multiple claims in one packet', () => {
    const claims = [baseClaim(), baseClaim({ claimType: 'prognosis', exactEvidenceSentence: 'PD-L1 expression was not associated with overall survival.', polarity: 'negated', direction: 'no_association' })];
    expect(resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims, summary: 'ok', warnings: [] }).claims).toHaveLength(2);
  });

  it('enforces exact evidence sentence presence', () => {
    const result = { schemaVersion: 'claims-v2' as const, claims: [baseClaim({ exactEvidenceSentence: 'not in packet' })], summary: 'bad', warnings: [] };
    expect(validateResultForPacket(result, packet).valid).toBe(false);
  });

  it('keeps normalized guesses separate from exact mentions', () => {
    const parsed = resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [baseClaim({ biomarkerMention: 'programmed death-ligand 1', biomarkerNormalizedGuess: 'PD-L1' })], summary: 'ok', warnings: [] });
    expect(parsed.claims[0].biomarkerMention).toBe('programmed death-ligand 1');
    expect(parsed.claims[0].biomarkerNormalizedGuess).toBe('PD-L1');
  });
});

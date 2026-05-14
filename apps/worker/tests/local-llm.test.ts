import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  candidateSentencePromptV2,
  emptyClaimsV2FromTriage,
  extractJsonBlock,
  extractionPromptV2,
  normalizeLocalLlmV2Payload,
  parseLocalLlmJson,
  selectCandidateEvidenceSentences,
  triagePacketLocally,
  verifyLocalLlmAvailable
} from '../src/local-llm';

const source = 'Radiotherapy significantly improved local control in lung cancer patients. Grade 3 toxicity occurred in 12% of patients.';

describe('local llm helpers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('extracts and parses json model output', () => {
    expect(extractJsonBlock('```json\n{"claims":[],"warnings":[]}\n```')).toBe('{"claims":[],"warnings":[]}');
    expect(parseLocalLlmJson('{"claims":[],"warnings":[]}')).toEqual({ claims: [], warnings: [] });
    expect(() => parseLocalLlmJson('{"claims":[')).toThrowError('local_llm_invalid_json');
  });

  it('uses claims-v2-lite.2 prompts with simpler model-facing fields', () => {
    const prompt = extractionPromptV2('source text');
    expect(prompt).toContain('"schemaVersion":"claims-v2-lite.2"');
    expect(prompt).toContain('Allowed claimKind');
    expect(prompt).toContain('association with survival');
    expect(prompt).toContain('Kaplan-Meier survival analysis');
  });

  it('builds a compact sentence-level claims-v2-lite.2 prompt', () => {
    const prompt = candidateSentencePromptV2(['Radiotherapy significantly improved local control in lung cancer patients.'], { title: 'Lung cancer radiotherapy' });
    expect(prompt).toContain('You extract candidate oncology evidence from candidate sentences');
    expect(prompt).toContain('Allowed claimKind');
    expect(prompt).toContain('local_control');
    expect(prompt).toContain('<sentence>Radiotherapy significantly improved local control in lung cancer patients.</sentence>');
  });

  it('selects direct oncology outcome sentences', () => {
    expect(selectCandidateEvidenceSentences(source)).toContain('Radiotherapy significantly improved local control in lung cancer patients.');
  });

  it('triages obvious non-cancer packets locally without extraction', () => {
    const triage = triagePacketLocally('This article describes river sediment and rainfall.');
    expect(triage.decision).toBe('skip_non_cancer');
    const empty = emptyClaimsV2FromTriage(triage);
    expect(empty.claims).toHaveLength(0);
    expect(empty.warnings).toContain('packet_triage:skip_non_cancer');
  });

  it('normalizes claims-v2-lite.1 toxicity and local-control records into canonical claims-v2 with diagnostics', () => {
    const normalized = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.1',
      claims: [
        { evidenceSentence: 'Radiotherapy significantly improved local control in lung cancer patients.', claimLabel: 'local_control', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'increased', confidence: 0.8 },
        { evidenceSentence: 'Grade 3 toxicity occurred in 12% of patients.', claimLabel: 'toxicity', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'associated', confidence: 0.75 },
        { evidenceSentence: 'Not in source.', claimLabel: 'toxicity', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'associated', confidence: 0.5 }
      ],
      warnings: []
    }, source);
    expect(normalized.schemaVersion).toBe('claims-v2');
    expect(normalized.claims.map((claim) => claim.claimType)).toEqual(['local_control', 'toxicity']);
    expect(normalized.warnings.some((warning) => warning.startsWith('claim_rejected:'))).toBe(true);
  });

  it('rejects low-confidence and methods/action-only lite claims', () => {
    const result = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.1',
      claims: [
        { evidenceSentence: 'To further validate its functionality during cancer cachexia, we injected MyoRep-AAV9 into the TA muscle of Apc Min/+ and WT mice of both sexes at 8 weeks of age.', claimLabel: 'biology', evidenceRole: 'this_study_result', evidenceModality: 'preclinical', populationOrModel: 'Apc Min/+ mice', effect: 'associated', confidence: 0.8 },
        { evidenceSentence: 'Radiotherapy significantly improved local control in lung cancer patients.', claimLabel: 'local_control', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'increased', confidence: 0.2 }
      ],
      warnings: []
    }, 'To further validate its functionality during cancer cachexia, we injected MyoRep-AAV9 into the TA muscle of Apc Min/+ and WT mice of both sexes at 8 weeks of age. Radiotherapy significantly improved local control in lung cancer patients.');
    expect(result.claims).toHaveLength(0);
    expect(result.diagnostics?.map((d) => d.code)).toContain('claim_rejected:non_result_sentence');
    expect(result.diagnostics?.map((d) => d.code)).toContain('claim_rejected:low_confidence');
  });

  it('infers study context from sentence and model hints', () => {
    const preclinical = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.1',
      claims: [
        { evidenceSentence: 'Tumor-bearing mice showed reduced tumor growth after treatment.', claimLabel: 'treatment_response', evidenceRole: 'this_study_result', evidenceModality: 'preclinical', effect: 'decreased', confidence: 0.8 },
        { evidenceSentence: 'MDA-MB-231 cells showed increased apoptosis after treatment.', claimLabel: 'biology', evidenceRole: 'this_study_result', evidenceModality: 'preclinical', effect: 'increased', confidence: 0.8 }
      ],
      warnings: []
    }, 'Tumor-bearing mice showed reduced tumor growth after treatment. MDA-MB-231 cells showed increased apoptosis after treatment.');
    const clinical = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.1',
      claims: [{ evidenceSentence: 'Patients with lung cancer in the phase II trial achieved improved progression-free survival.', claimLabel: 'treatment_response', evidenceRole: 'this_study_result', evidenceModality: 'clinical', effect: 'increased', confidence: 0.8 }],
      warnings: []
    }, 'Patients with lung cancer in the phase II trial achieved improved progression-free survival.');
    expect([...preclinical.claims, ...clinical.claims].map((claim) => claim.studyContext)).toEqual(['animal', 'cell_line', 'clinical_trial']);
  });

  it('requires approved installed Ollama model before claiming work', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'qwen3:14b', timeoutMs: 1000, options: {} })).resolves.toBeUndefined();
  });
});

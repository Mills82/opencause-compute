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

  it('normalizes lite.2 metadata origin/type/context from accepted and obvious missed examples', () => {
    const priorWork = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.2',
      claims: [
        { evidenceSentence: 'Its downregulation, particularly in response to HGF/cMET signaling, is a major mechanism by which UM cells acquire resistance to MEK inhibitors [ ].', claimKind: 'resistance', cancer: 'uveal melanoma', interventionOrExposure: 'MEK inhibitors', outcome: 'resistance', effectText: 'acquire resistance', evidenceLevel: 'human', confidence: 0.82 },
        { evidenceSentence: 'Somatic mutations in FOXO1 are associated with increased metastatic potential and poorer prognosis in UM patients [ ], and the gene is known to regulate multiple miRNAs in the context of cancer [ ].', claimKind: 'prognosis', cancer: 'uveal melanoma', subject: 'FOXO1', outcome: 'poorer prognosis', effectText: 'associated with poorer prognosis', evidenceLevel: 'human', confidence: 0.82 }
      ],
      warnings: []
    }, 'Its downregulation, particularly in response to HGF/cMET signaling, is a major mechanism by which UM cells acquire resistance to MEK inhibitors [ ]. Somatic mutations in FOXO1 are associated with increased metastatic potential and poorer prognosis in UM patients [ ], and the gene is known to regulate multiple miRNAs in the context of cancer [ ].', { title: 'Uveal melanoma', sectionTitle: 'Discussion', sectionType: 'discussion' });
    const treatment = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.2',
      claims: [{ evidenceSentence: 'Neutralization of GDF-15 with the anti-GDF-15 antibody significantly reversed body weight loss in tumour-bearing mice.', claimKind: 'treatment', cancer: 'cancer cachexia', interventionOrExposure: 'anti-GDF-15 antibody', outcome: 'body weight loss', effectText: 'significantly reversed', evidenceLevel: 'animal', confidence: 0.86 }],
      warnings: []
    }, 'Neutralization of GDF-15 with the anti-GDF-15 antibody significantly reversed body weight loss in tumour-bearing mice.', { title: 'Cancer cachexia', sectionTitle: 'Results', sectionType: 'results' });
    const clinical = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite.2',
      claims: [{ evidenceSentence: 'An increasing number of reported severe sunburns during childhood was significantly associated with a longer OS.', claimKind: 'prognosis', cancer: 'metastatic melanoma', subject: 'severe sunburns during childhood', outcome: 'overall survival', effectText: 'associated with longer OS', evidenceLevel: 'human', confidence: 0.78 }],
      warnings: []
    }, 'An increasing number of reported severe sunburns during childhood was significantly associated with a longer OS.', { title: 'Metastatic melanoma', sectionTitle: 'Results', sectionType: 'results' });
    const claims = [...priorWork.claims, ...treatment.claims, ...clinical.claims];
    expect(claims.map((claim) => claim.claimType)).toEqual(['resistance', 'prognosis', 'treatment_response', 'prognosis']);
    expect(claims[0]?.evidenceOrigin).toBe('cited_prior_work');
    expect(claims[1]?.evidenceOrigin).toBe('cited_prior_work');
    expect(claims[2]?.evidenceType).toBe('preclinical');
    expect(claims[2]?.studyContext).toBe('animal');
    expect(claims[3]?.evidenceType).toBe('clinical');
    expect(claims[3]?.studyContext).toBe('human_cohort');
    expect(claims.every((claim) => claim.sectionTitle)).toBe(true);
  });

  it('requires approved installed Ollama model before claiming work', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'qwen3:14b', timeoutMs: 1000, options: {} })).resolves.toBeUndefined();
  });

  it('allows candidate local models during availability check when explicitly enabled', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
    process.env.OPENCAUSE_ALLOW_CANDIDATE_LOCAL_MODEL = 'true';
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'gemma3:12b', timeoutMs: 1000, options: {} })).resolves.toBeUndefined();
    delete process.env.OPENCAUSE_ALLOW_CANDIDATE_LOCAL_MODEL;
  });
});

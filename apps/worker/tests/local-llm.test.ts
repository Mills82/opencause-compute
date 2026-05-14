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

  it('uses claims-v2-lite.1 prompts without summaries', () => {
    const prompt = extractionPromptV2('source text');
    expect(prompt).toContain('"schemaVersion":"claims-v2-lite.1"');
    expect(prompt).toContain('Do not include a summary');
    expect(prompt).toContain('toxicity');
    expect(prompt).toContain('local control');
  });

  it('builds a compact sentence-level claims-v2-lite.1 prompt', () => {
    const prompt = candidateSentencePromptV2(['Radiotherapy significantly improved local control in lung cancer patients.'], { title: 'Lung cancer radiotherapy' });
    expect(prompt).toContain('You classify candidate oncology evidence sentences');
    expect(prompt).toContain('claimLabel="toxicity"');
    expect(prompt).toContain('claimLabel="local_control"');
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

  it('requires approved installed Ollama model before claiming work', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'qwen3:14b', timeoutMs: 1000, options: {} })).resolves.toBeUndefined();
  });
});

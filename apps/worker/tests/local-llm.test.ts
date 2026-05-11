import { describe, expect, it } from 'vitest';
import { emptyClaimsV2FromTriage, extractJsonBlock, extractionPromptV2, normalizeLocalLlmPayload, normalizeLocalLlmV2Payload, parseLocalLlmJson, triagePacketLocally } from '../src/local-llm';

function liteClaim(sentence: string, overrides: Record<string, unknown> = {}) {
  return {
    claimType: 'treatment_response',
    evidenceOrigin: 'this_study_result',
    evidenceType: 'clinical',
    studyContext: 'human_cohort',
    polarity: 'affirmed',
    direction: 'associated',
    cancerType: 'lung cancer',
    biomarkerMention: 'EGFR mutation',
    drugOrInterventionMention: 'osimertinib',
    outcomeMention: 'response',
    exactEvidenceSentence: sentence,
    reviewPriority: 'high',
    confidence: 0.9,
    ...overrides
  };
}

describe('local llm helpers', () => {
  it('extracts json object from plain model output', () => {
    const raw = '{"facts":[],"summary":"ok","warnings":[]}';
    expect(extractJsonBlock(raw)).toBe(raw);
  });

  it('extracts json object from wrapped output', () => {
    const raw = '```json\n{"facts":[],"summary":"ok","warnings":[]}\n```';
    expect(extractJsonBlock(raw)).toBe('{"facts":[],"summary":"ok","warnings":[]}');
  });

  it('throws when json is missing', () => {
    expect(() => extractJsonBlock('no json here')).toThrowError('local_llm_invalid_json');
  });

  it('parses plain and markdown-wrapped local model json', () => {
    const json = '{"facts":[],"summary":"ok","warnings":[]}';
    expect(parseLocalLlmJson(json)).toEqual({ facts: [], summary: 'ok', warnings: [] });
    expect(parseLocalLlmJson(`\n\`\`\`json\n${json}\n\`\`\``)).toEqual({ facts: [], summary: 'ok', warnings: [] });
  });

  it('rejects malformed local model json', () => {
    expect(() => parseLocalLlmJson('{"facts":[')).toThrowError('local_llm_invalid_json');
  });

  it('normalizes nullable and missing local model fields', () => {
    const normalized = normalizeLocalLlmPayload({
      facts: [{ drugOrCompound: null, relationshipType: 'associated with response', evidenceSentence: null, confidence: '0.7' }]
    });
    expect(normalized.summary).toContain('No candidate facts extracted');
    expect(normalized.warnings).toContain('local_model_missing_warnings_array');
    expect(normalized.warnings).toContain('local_model_returned_no_facts');
    expect(normalized.facts).toHaveLength(0);
  });

  it('keeps facts with exact source evidence', () => {
    const evidenceSentence = 'Responses to atezolizumab appear durable in metastatic triple-negative breast cancer.';
    const normalized = normalizeLocalLlmPayload({
      facts: [{ drugOrCompound: null, relationshipType: 'associated_with_response', evidenceSentence, confidence: '0.7' }],
      summary: 'ok',
      warnings: []
    }, evidenceSentence);
    expect('facts' in normalized ? normalized.facts[0].relationshipType : '').toBe('associated_with_response');
    expect('facts' in normalized ? normalized.facts[0].drugOrCompound : '').toBeUndefined();
    expect('facts' in normalized ? normalized.facts[0].confidence : 0).toBe(0.7);
  });

  it('uses claims-v2-lite prompt for local v2 extraction', () => {
    const prompt = extractionPromptV2('source text');
    expect(prompt).toContain('"schemaVersion":"claims-v2-lite"');
    expect(prompt).toContain('Return 0 to 2 claims');
    expect(prompt).not.toContain('biomarkerNormalizedGuess');
    expect(prompt).not.toContain('charStart');
    expect(prompt).not.toContain('evidenceContext');
  });

  it('triages obvious non-cancer packets locally without extraction', () => {
    const triage = triagePacketLocally('The district receives average rainfall and has 312 rainy days.', 'PMC article (Climate chunk 4/27)');
    expect(triage.decision).toBe('skip_non_cancer');
    const empty = emptyClaimsV2FromTriage(triage);
    expect(empty.claims).toEqual([]);
    expect(empty.noClaimReason).toBe('no_cancer_claim');
    expect(empty.warnings).toContain('packet_triage:skip_non_cancer');
  });

  it('triages correction notices locally without extraction', () => {
    const triage = triagePacketLocally('Following publication of the original article, the author reported that figure legends were captured incorrectly.', 'Correction chunk 1/1');
    expect(triage.decision).toBe('skip_correction_notice');
  });

  it('triages clear cancer claim opportunities for extraction', () => {
    const triage = triagePacketLocally('EGFR mutation was associated with improved response to osimertinib in lung cancer.', 'Results');
    expect(triage.decision).toBe('extract_now');
  });

  it('fails open for cancer-related methods packets with claim-opportunity terms', () => {
    const triage = triagePacketLocally('Patients with lung cancer received treatment and overall survival outcomes were collected.', 'Methods and materials');
    expect(triage.decision).toBe('extract_now');
  });

  it('uses existing packet metadata during deterministic triage', () => {
    const triage = triagePacketLocally({
      title: 'Results',
      sourceText: 'Response was measured after treatment.',
      sourceCitation: 'PMID: 12345; article about lung cancer',
      sourceUrl: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/',
      sourcePublishedAt: '2026-01-01'
    });
    expect(triage.decision).toBe('extract_now');
  });

  it('normalizes claims-v2-lite clear claim output into stored claims-v2 and computes offsets', () => {
    const sentence = 'In this human cohort, EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const source = `Background sentence. ${sentence} Closing sentence.`;
    const normalized = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite',
      claims: [liteClaim(sentence, { charStart: 0, charEnd: 0, biomarkerNormalizedGuess: 'EGFR', evidenceContext: 'Background sentence.' })],
      summary: 'ok',
      warnings: []
    }, source);
    expect(normalized.schemaVersion).toBe('claims-v2');
    expect(normalized.claims[0].reviewPriority).toBe('high');
    expect(normalized.claims[0].biomarkerMention).toBe('EGFR mutation');
    expect(normalized.claims[0].biomarkerNormalizedGuess).toBeUndefined();
    expect(normalized.claims[0].evidenceContext).toBeUndefined();
    expect(normalized.claims[0].charStart).toBe(source.indexOf(sentence));
    expect(normalized.claims[0].charEnd).toBe(source.indexOf(sentence) + sentence.length);
  });


  it('deduplicates repeated claims by exact evidence sentence and caps claims-v2 output at two', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const repeated = [
      liteClaim(sentence),
      liteClaim(`${sentence} 3`, { claimType: 'prognosis' }),
      liteClaim(`${sentence} 4`, { claimType: 'risk' }),
      liteClaim(sentence, { claimType: 'progression' })
    ];
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2', claims: repeated, summary: 'ok', warnings: [] }, [sentence, `${sentence} 3`, `${sentence} 4`, `${sentence} 5`].join(' '));
    expect(normalized.claims).toHaveLength(2);
    expect(new Set(normalized.claims.map((claim) => claim.exactEvidenceSentence)).size).toBe(2);
    expect(normalized.claims.every((claim) => claim.evidenceContext === undefined)).toBe(true);
    expect(normalized.warnings).toContain('local_model_returned_too_many_claims_truncated_to_2');
  });

  it('drops claims-v2 entries without exact source evidence and records no-claim reason', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim('not present')], noClaimReason: 'insufficient_context', summary: 'none', warnings: [] }, 'source text');
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.noClaimReason).toBe('insufficient_context');
  });

  it('accepts methods-only empty output as a successful claims-v2 result', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [], noClaimReason: 'methods_only', summary: 'Methods only.', warnings: [] }, 'Cells were treated with gefitinib for 24 hours.');
    expect(normalized.claims).toEqual([]);
    expect(normalized.noClaimReason).toBe('methods_only');
  });

  it('accepts background/review empty output as a successful claims-v2 result', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [], noClaimReason: 'background_only', summary: 'Background review text only.', warnings: [] }, 'Prior reviews have discussed EGFR in lung cancer.');
    expect(normalized.claims).toEqual([]);
    expect(normalized.noClaimReason).toBe('background_only');
  });

  it('accepts broad candidate list empty output as a successful claims-v2 result', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [], noClaimReason: 'insufficient_context', summary: 'Broad candidate list without specific relationships.', warnings: [] }, 'We identified hundreds of genes, drugs, compounds, and pathways for future study.');
    expect(normalized.claims).toEqual([]);
    expect(normalized.noClaimReason).toBe('insufficient_context');
  });

  it('accepts noisy insufficient-context empty output as a successful claims-v2 result', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [], noClaimReason: 'extraction_uncertain', summary: 'No grounded cancer claim.', warnings: ['noisy text'] }, 'fragment EGFR table response maybe unclear');
    expect(normalized.claims).toEqual([]);
    expect(normalized.noClaimReason).toBe('extraction_uncertain');
  });

  it('drops claims containing null values or placeholder strings', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { cancerType: null }), liteClaim(`${sentence} 2`, { cancerType: 'unknown' })], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, `${sentence} ${sentence} 2`);
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.noClaimReason).toBe('extraction_uncertain');
  });

  it('drops claims with invalid enum values', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { claimType: 'made_up' })], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
  });

  it('drops claims with missing confidence', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const claim = liteClaim(sentence);
    delete claim.confidence;
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [claim], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
  });

  it('drops claims with out-of-range confidence', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { confidence: 1.5 })], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
  });

  it('drops claims with unexpected schemaVersion', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'unexpected', claims: [liteClaim(sentence)], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
  });
  });

import { afterEach, vi } from 'vitest';
import { verifyLocalLlmAvailable } from '../src/local-llm';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe('local llm preflight', () => {
  it('requires the selected Ollama model to be installed before claiming work', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: 'other-model' }] }), { status: 200 })) as typeof fetch;
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'llama3.2:3b', timeoutMs: 1000, options: {} })).rejects.toThrow('local_llm_model_missing:llama3.2:3b');
  });

  it('passes when the selected Ollama model is installed', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: 'llama3.2:3b' }] }), { status: 200 })) as typeof fetch;
    await expect(verifyLocalLlmAvailable({ endpoint: 'http://127.0.0.1:11434', model: 'llama3.2:3b', timeoutMs: 1000, options: {} })).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { candidateSentencePromptV2, emptyClaimsV2FromTriage, extractJsonBlock, extractionPromptV2, normalizeLocalLlmPayload, normalizeLocalLlmV2Payload, parseLocalLlmJson, selectCandidateEvidenceSentences, triagePacketLocally } from '../src/local-llm';

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
    expect(prompt).toContain('Extract a claim when one exact sentence directly states a cancer-related finding or cited finding');
    expect(prompt).toContain('If one exact sentence directly states a cancer-related treatment response');
    expect(prompt).toContain('Background or review-style claims may be extracted when one exact sentence clearly states');
    expect(prompt).toContain('Do not treat bibliometric counts, keyword frequencies');
    expect(prompt).toContain('treatment regimens, dose ranges, follow-up duration');
    expect(prompt).toContain('Do not write a claim-like summary while returning claims: []');
    expect(prompt).toContain('If the summary would state a specific cancer-related claim, include that claim in claims');
    expect(prompt).toContain('exactEvidenceSentence should be a complete source sentence that can stand alone');
    expect(prompt).not.toContain('JAVELIN Renal 101');
    expect(prompt).not.toContain('biomarkerNormalizedGuess');
    expect(prompt).not.toContain('charStart');
    expect(prompt).not.toContain('evidenceContext');
  });

  it('documents prompt guardrail: background/review clear cancer claims should be low-priority extractable', () => {
    const prompt = extractionPromptV2('Prior reviews found that cisplatin exposure increases sensorineural hearing loss risk in pediatric brain tumor survivors.');
    expect(prompt).toContain('Use evidenceOrigin="background", "cited_prior_work", or "review_summary" and reviewPriority="low"');
    expect(prompt).toContain('toxicity, local control, survival, recurrence, progression, resistance, response, or outcome claim');
  });

  it('documents prompt guardrail: bibliometric clusters are not biomedical cancer claims', () => {
    const prompt = extractionPromptV2('Cluster 2 included 122 papers and focused on nanocarriers in nasopharyngeal carcinoma.');
    expect(prompt).toContain('bibliometric counts, keyword frequencies, author/country/journal rankings');
    expect(prompt).toContain('citation cluster descriptions');
  });

  it('documents prompt guardrail: dose ranges and follow-up duration are not treatment response claims without outcomes', () => {
    const prompt = extractionPromptV2('The dose regimen ranged from 50.4 to 66.6 Gy and follow-up exceeded 3 years.');
    expect(prompt).toContain('treatment regimens, dose ranges, follow-up duration');
    expect(prompt).toContain('unless the exact sentence ties them to response, survival, recurrence, toxicity, local control, progression, diagnosis, risk, or another outcome');
  });

  it('documents prompt guardrail: methods and eligibility criteria should not be extracted as findings', () => {
    const prompt = extractionPromptV2('Patients with complete response after neoadjuvant therapy were eligible.');
    expect(prompt).toContain('study objectives, eligibility criteria');
    expect(prompt).toContain('Do not extract methods-only mentions as findings');
  });

  it('documents prompt guardrail: empty-claim summaries should stay neutral', () => {
    const prompt = extractionPromptV2('source text');
    expect(prompt).toContain('If no claim is included, keep the summary neutral and explain that no grounded claim was extracted');
  });

  it('documents prompt guardrail: evidence sentences should not be fragments', () => {
    const prompt = extractionPromptV2('NUPR1 strongly correlated with poor prognosis in TNBC.');
    expect(prompt).toContain('Do not use sentence fragments such as "strongly correlated with poor prognosis"');
    expect(prompt).toContain('unless the full source sentence is copied');
  });

  it('documents prompt rule: direct cancer findings should be extracted', () => {
    const prompt = extractionPromptV2('In the Phase III JAVELIN Renal 101 study, axitinib plus avelumab was associated with a significant improvement in progression-free survival (PFS) and overall response rate (ORR) in comparison to sunitinib.');
    expect(prompt).toContain('Extract a claim when one exact sentence directly states a cancer-related finding or cited finding');
    expect(prompt).toContain('return one claim');
  });

  it('selects direct cancer outcome sentences for sentence-level classification', () => {
    const source = [
      'Patients were included if records were complete.',
      'The dose regimen ranged from 50.4 to 66.6 Gy for Grade I.',
      'Our study demonstrates that SBRT is safe and effective for selected patients with stage III LN-positive NSCLC.',
      'Omitting metastatic LN irradiation yields survival outcomes comparable with nodal irradiation, with reduced acute esophagitis.'
    ].join(' ');
    const selected = selectCandidateEvidenceSentences(source, 2);
    expect(selected).toContain('Our study demonstrates that SBRT is safe and effective for selected patients with stage III LN-positive NSCLC.');
    expect(selected.some((sentence) => sentence.includes('dose regimen'))).toBe(false);
  });

  it('builds a compact sentence-level claims prompt', () => {
    const prompt = candidateSentencePromptV2(['A systematic review showed that a surgical delay of four weeks can adversely affect survival in patients with lung cancer.'], { title: 'Review of lung cancer surgery timing' });
    expect(prompt).toContain('You classify candidate cancer-literature evidence sentences.');
    expect(prompt).toContain('Each claim must use one complete candidate sentence copied exactly');
    expect(prompt).toContain('exactEvidenceSentence must equal one candidate sentence exactly');
    expect(prompt).toContain('Context:');
    expect(prompt).toContain('Title: Review of lung cancer surgery timing');
    expect(prompt).toContain('Use the context below to resolve abbreviations');
    expect(prompt).toContain('<sentence>A systematic review showed');
    expect(prompt).toContain('surgical delay of four weeks');
    expect(prompt).not.toContain('Source text follows');
  });

  it('uses packet context to select abbreviation-only cancer candidate sentences', () => {
    const source = [
      'HNRNPA2B1 knockdown significantly repressed proliferation and metastasis and promoted apoptosis.',
      'Cells were seeded into six-well plates for transfection.'
    ].join(' ');
    const selected = selectCandidateEvidenceSentences(source, 8, 'Triple-negative breast cancer TNBC results');
    expect(selected).toContain('HNRNPA2B1 knockdown significantly repressed proliferation and metastasis and promoted apoptosis.');
  });

  it('sentence selector requires cancer relevance in the candidate sentence', () => {
    const source = [
      'SKIL emerged as the most significant contributor to DFU pathogenesis, showing consistent upregulation across multiple datasets and strong correlation with disease progression.',
      'HGGs are characterized by rapid growth, frequent recurrence, and poor prognosis, underscoring the clinical value of aggressive, individualized treatment.'
    ].join(' ');
    const selected = selectCandidateEvidenceSentences(source, 5);
    expect(selected.some((sentence) => sentence.includes('DFU pathogenesis'))).toBe(false);
    expect(selected.some((sentence) => sentence.includes('HGGs are characterized'))).toBe(true);
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

  it('fails open for CNS tumor radiotherapy outcome language', () => {
    const triage = triagePacketLocally('Radiologic local control was reported in patients with intracranial meningioma after proton therapy.', 'Discussion');
    expect(triage.decision).toBe('extract_now');
  });

  it('fails open for brain tumor radiation toxicity language', () => {
    const triage = triagePacketLocally('Higher radiation dose was associated with toxicity and recurrence in pediatric brain tumor survivors.', 'Results');
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

  it('fills obvious cancer type from packet context when the evidence sentence uses only abbreviations', () => {
    const sentence = 'HNRNPA2B1 knockdown significantly repressed proliferation and metastasis and promoted apoptosis.';
    const normalized = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite',
      claims: [liteClaim(sentence, { cancerType: undefined, biomarkerMention: 'HNRNPA2B1', drugOrInterventionMention: 'HNRNPA2B1 knockdown', outcomeMention: 'proliferation, metastasis, apoptosis' })],
      summary: 'ok',
      warnings: []
    }, sentence, { title: 'HNRNPA2B1 knockdown in TNBC cells' });
    expect(normalized.claims).toHaveLength(1);
    expect(normalized.claims[0].cancerType).toBe('triple-negative breast cancer');
  });

  it('drops generic disease-definition claims without specific entities', () => {
    const sentence = 'Glioblastoma is the most common and aggressive primary malignant brain tumor with poor prognosis.';
    const normalized = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite',
      claims: [liteClaim(sentence, { claimType: 'prognosis', cancerType: 'glioblastoma', biomarkerMention: undefined, drugOrInterventionMention: undefined, outcomeMention: undefined })],
      noClaimReason: 'background_only',
      summary: 'none',
      warnings: []
    }, sentence);
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.noClaimReason).toBe('background_only');
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

  it('keeps later valid claims when the local model returns too many invalid leading claims', () => {
    const validSentence = 'HGGs are characterized by rapid growth, frequent recurrence, and poor prognosis, underscoring the clinical value of aggressive, individualized treatment.';
    const normalized = normalizeLocalLlmV2Payload({
      schemaVersion: 'claims-v2-lite',
      claims: [
        liteClaim('not present'),
        liteClaim('CC [ , ]'),
        liteClaim(validSentence, { claimType: 'prognosis', evidenceOrigin: 'background', reviewPriority: 'high' })
      ],
      summary: 'ok',
      warnings: []
    }, validSentence);
    expect(normalized.claims).toHaveLength(1);
    expect(normalized.claims[0].exactEvidenceSentence).toBe(validSentence);
    expect(normalized.claims[0].reviewPriority).toBe('low');
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

  it('sanitizes null or placeholder optional fields instead of dropping otherwise valid claims', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { cancerType: null, drugOrInterventionMention: 'unknown' })], noClaimReason: 'extraction_uncertain', summary: 'ok', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(1);
    expect(normalized.claims[0].cancerType).toBe('lung cancer');
    expect(normalized.claims[0].drugOrInterventionMention).toBeUndefined();
  });

  it('drops claims with invalid enum values', () => {
    const sentence = 'EGFR mutation was associated with improved response to osimertinib in lung cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { claimType: 'made_up' })], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.warnings).toContain('claim_rejected:invalid_required_field:1');
  });

  it('drops claims with citation-fragment evidence', () => {
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim('CC [ , ]')], noClaimReason: 'extraction_uncertain', summary: 'bad', warnings: [] }, 'CC [ , ]');
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.warnings).toContain('claim_rejected:bad_evidence_sentence:1');
  });

  it('keeps strong clinical outcome evidence without an explicit cancer word but flags it for review', () => {
    const sentence = 'The 53% ORR, median PFS of 22.1 months and 1- and 2-year OS rates of 78% and 69% respectively amongst patients in C1 of our study are comparable with prior reports.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { cancerType: undefined, biomarkerMention: undefined, drugOrInterventionMention: undefined, outcomeMention: 'ORR, PFS, OS', statisticalEvidenceMention: '53%; 22.1 months; 78%; 69%', evidenceOrigin: 'this_study_result' })], summary: 'ok', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(1);
    expect(normalized.claims[0].exactEvidenceSentence).toBe(sentence);
    expect(normalized.warnings).toContain('claim_flagged:weak_cancer_lexicon_match_strong_oncology_outcome');
  });


  it('rejects generic non-result claims even when the model emits a claim', () => {
    const sentence = 'The aim of this study was to evaluate the prognostic value of circulating tumor DNA in metastatic breast cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { claimType: 'prognosis', evidenceOrigin: 'this_study_result', outcomeMention: 'prognostic value' })], summary: 'bad', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(0);
    expect(normalized.warnings).toContain('claim_rejected:non_result_sentence:1');
  });

  it('keeps statistical model findings when they assert an actual result', () => {
    const sentence = 'In multivariable Cox analysis, high ctDNA levels independently predicted shorter progression-free survival in metastatic breast cancer.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { claimType: 'prognosis', biomarkerMention: 'ctDNA', outcomeMention: 'progression-free survival', evidenceOrigin: 'this_study_result' })], summary: 'ok', warnings: [] }, sentence);
    expect(normalized.claims).toHaveLength(1);
  });

  it('downgrades non-this-study review priority to low', () => {
    const sentence = 'HGGs are characterized by rapid growth, frequent recurrence, and poor prognosis, underscoring the clinical value of aggressive, individualized treatment.';
    const normalized = normalizeLocalLlmV2Payload({ schemaVersion: 'claims-v2-lite', claims: [liteClaim(sentence, { evidenceOrigin: 'cited_prior_work', reviewPriority: 'high' })], summary: 'ok', warnings: [] }, sentence);
    expect(normalized.claims[0].reviewPriority).toBe('low');
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

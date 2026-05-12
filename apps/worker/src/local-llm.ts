import { DEFAULT_LOCAL_MODEL, assertApprovedModel, hashText, resultPayloadSchema, resultPayloadV2Schema, type ExtractedClaim, type PacketTriage, type ResultPayload, type ResultPayloadV2 } from '@opencause/shared';

const ALLOWED_RELATIONSHIPS = new Set([
  'associated_with_response',
  'associated_with_resistance',
  'associated_with_risk',
  'associated_with_progression',
  'studied_with',
  'unclear'
]);

export const LOCAL_LLM_PROMPT_VERSION = 'local-llm-v1-prompt-2026-05-08';
export const LOCAL_LLM_V2_PROMPT_VERSION = 'local-llm-v2-lite-prompt-2026-05-11';

const CLAIM_TYPES = ['treatment_response','resistance','prognosis','risk','progression','diagnosis','biology','studied_with','unclear'] as const;
const EVIDENCE_ORIGINS = ['this_study_result','cited_prior_work','background','methods_only','hypothesis_or_speculation','review_summary','unclear'] as const;
const EVIDENCE_TYPES = ['clinical','preclinical','computational','review','case_report','unclear'] as const;
const STUDY_CONTEXTS = ['human_cohort','clinical_trial','cell_line','animal','organoid','mixed','unclear'] as const;
const POLARITIES = ['affirmed','negated','speculative','uncertain'] as const;
const DIRECTIONS = ['increased','decreased','associated','no_association','mixed','unclear'] as const;
const REVIEW_PRIORITIES = ['high','medium','low'] as const;
const NO_CLAIM_REASONS = ['no_cancer_claim','methods_only','background_only','insufficient_context','extraction_uncertain','other'] as const;
const PLACEHOLDER_STRINGS = new Set(['n/a', 'na', 'none', 'null', 'unknown', 'not mentioned', 'not applicable', 'not provided']);
const CANCER_TERMS = /\b(cancer|tumou?r|neoplasm|oncolog|carcinoma|sarcoma|melanoma|leukemia|leukaemia|lymphoma|glioma|glioblastoma|hggs?|meningioma|brain\s+tumou?r|cns\s+tumou?r|myeloma|metasta|malignan|nsclc|sclc|egfr|alk|brca|pd-?l1|her2|kras|braf)\b/i;
const CLAIM_OPPORTUNITY_TERMS = /\b(response|resistan|survival|prognos|risk|progression|diagnos|associated|correlat|predict|biomarker|mutation|variant|expression|therapy|treatment|drug|inhibitor|immunotherapy|chemotherapy|radiotherapy|proton\s+therapy|radiation\s+dose|toxicit|local\s+control|recurrence|metasta|overall survival|progression-free survival|pfs|os)\b/i;
const CANDIDATE_SENTENCE_TERMS = new RegExp(`${CANCER_TERMS.source}|${CLAIM_OPPORTUNITY_TERMS.source}|\b(IC50|ORR|PFS|OS|hazard ratio|HR|AUC|sensitivity|specificity|apoptosis|proliferation|migration|invasion|tumor growth|tumour growth|antitumor|anti-tumor|chemoresistance|radiosensiti[sz]ation)\b`, 'i');

export type LocalLlmConfig = {
  endpoint: string;
  model: string;
  timeoutMs: number;
  options: OllamaGenerationOptions;
  qualityTier: 'low' | 'balanced' | 'high' | 'ultra';
};

export type LocalLlmProgress = { phase: 'streaming' | 'completed'; responseChars: number; chunkCount: number; evalCount?: number; totalDurationMs?: number; evalDurationMs?: number };

export type OllamaGenerationOptions = {
  temperature: number;
  top_p: number;
  num_ctx: number;
  num_predict: number;
};

const DEFAULT_ENDPOINT = process.env.LOCAL_LLM_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.LOCAL_LLM_MODEL ?? DEFAULT_LOCAL_MODEL;
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? '300000');

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function defaultQualityTier(options: OllamaGenerationOptions): 'low' | 'balanced' | 'high' | 'ultra' {
  if (options.num_ctx >= 16384 && options.temperature === 0) return 'ultra';
  if (options.num_ctx >= 8192 && options.temperature === 0) return 'high';
  if (options.num_ctx >= 4096) return 'balanced';
  return 'low';
}

export function readLocalLlmConfig(): LocalLlmConfig {
  assertApprovedModel(DEFAULT_MODEL, {
    allowLarge: process.env.ALLOW_LARGE_LOCAL_MODEL === 'true',
    allowExperimental: process.env.ALLOW_EXPERIMENTAL_LOCAL_MODEL === 'true'
  });
  return {
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    timeoutMs: Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 45000,
    options: {
      temperature: envNumber('LOCAL_LLM_TEMPERATURE', 0),
      top_p: envNumber('LOCAL_LLM_TOP_P', 0.9),
      num_ctx: envNumber('LOCAL_LLM_NUM_CTX', 16384),
      num_predict: envNumber('LOCAL_LLM_NUM_PREDICT', 5000)
    },
    qualityTier: process.env.LOCAL_LLM_QUALITY_TIER as LocalLlmConfig['qualityTier'] || 'high'
  };
}

export function generationQualityTier(config: LocalLlmConfig): 'low' | 'balanced' | 'high' | 'ultra' {
  return config.qualityTier ?? defaultQualityTier(config.options);
}

export function extractionPrompt(sourceText: string): string {
  return [
    'You extract structured biomedical facts from source text.',
    'Return ONLY valid compact JSON matching this schema exactly:',
    '{"facts":[{"cancerType?":string,"geneOrBiomarker?":string,"drugOrCompound?":string,"relationshipType":string,"evidenceSentence":string,"confidence":number}],"summary":string,"warnings":string[]}',
    'Allowed relationshipType values:',
    'associated_with_response, associated_with_resistance, associated_with_risk, associated_with_progression, studied_with, unclear',
    'Rules:',
    '- evidenceSentence must be an exact sentence copied from source text',
    '- if you cannot copy an exact evidence sentence, omit that fact',
    '- omit cancerType, geneOrBiomarker, and drugOrCompound when unknown; never use null or placeholder text',
    '- confidence must be between 0 and 1',
    '- return at most 3 high-confidence facts',
    '- returning zero facts is acceptable when evidence is weak or not exact',
    '- do not add markdown or commentary, output JSON only',
    'Source text follows:',
    sourceText
  ].join('\n');
}

export function extractionPromptV2(sourceText: string): string {
  return [
    'You extract candidate cancer-literature claims from source text.',
    'Important: these are NOT accepted scientific facts. They are candidate claims for later validation.',
    'Return ONLY valid JSON. No markdown. No commentary.',
    'JSON shape: {"schemaVersion":"claims-v2-lite","claims":[],"noClaimReason":"","summary":"","warnings":[]}',
    'Each claim: {"claimType":"","evidenceOrigin":"","evidenceType":"","studyContext":"","polarity":"","direction":"","cancerType":"","biomarkerMention":"","drugOrInterventionMention":"","outcomeMention":"","statisticalEvidenceMention":"","sampleSizeMention":"","exactEvidenceSentence":"","reviewPriority":"","confidence":0}',
    'Allowed values:',
    'claimType = treatment_response, resistance, prognosis, risk, progression, diagnosis, biology, studied_with, unclear',
    'evidenceOrigin = this_study_result, cited_prior_work, background, methods_only, hypothesis_or_speculation, review_summary, unclear',
    'evidenceType = clinical, preclinical, computational, review, case_report, unclear',
    'studyContext = human_cohort, clinical_trial, cell_line, animal, organoid, mixed, unclear',
    'polarity = affirmed, negated, speculative, uncertain',
    'direction = increased, decreased, associated, no_association, mixed, unclear',
    'reviewPriority = high, medium, low',
    'Rules:',
    '- Return 0 to 2 claims.',
    '- Only extract cancer-related claims supported by one exact source sentence.',
    '- Copy exactEvidenceSentence exactly from the source text.',
    '- exactEvidenceSentence should be a complete source sentence that can stand alone. Do not use sentence fragments such as "strongly correlated with poor prognosis" unless the full source sentence is copied.',
    '- Extract a claim when one exact sentence directly states a cancer-related finding or cited finding. Prefer zero claims only when the sentence is weak, vague, methods-only, duplicated, or requires inference.',
    '- If one exact sentence directly states a cancer-related treatment response, survival, recurrence, toxicity, local control, diagnosis, prognosis, resistance, biomarker, or biology finding, return one claim.',
    '- Background or review-style claims may be extracted when one exact sentence clearly states a specific cancer-related association, diagnosis, prognosis, risk, treatment, biology, toxicity, local control, survival, recurrence, progression, resistance, response, or outcome claim. Use evidenceOrigin="background", "cited_prior_work", or "review_summary" and reviewPriority="low" unless the sentence reports this study\'s own result.',
    '- Do not treat bibliometric counts, keyword frequencies, author/country/journal rankings, literature-search methods, citation cluster descriptions, study objectives, eligibility criteria, treatment regimens, dose ranges, follow-up duration, or general study characteristics as biomedical cancer claims unless the exact sentence ties them to response, survival, recurrence, toxicity, local control, progression, diagnosis, risk, or another outcome.',
    '- Do not write a claim-like summary while returning claims: []. If the summary would state a specific cancer-related claim, include that claim in claims using one exact supporting sentence. If no claim is included, keep the summary neutral and explain that no grounded claim was extracted.',
    '- Do not extract methods-only mentions as findings.',
    '- Do not expand broad lists of genes, drugs, compounds, pathways, or candidates into many claims.',
    '- Omit unknown optional fields. Never use null or placeholder values like N/A, unknown, or not mentioned.',
    '- If claims is empty, set noClaimReason to no_cancer_claim, methods_only, background_only, insufficient_context, extraction_uncertain, or other.',
    '- summary must be one short sentence. warnings must be an array of short strings or [].',
    '- Output JSON only. No markdown or commentary.',
    'Source text follows:',
    sourceText
  ].join('\n');
}

export function candidateSentencePromptV2(candidateSentences: string[]): string {
  return [
    'You classify candidate cancer-literature evidence sentences.',
    'Return ONLY valid JSON. No markdown. No commentary.',
    'JSON shape: {"schemaVersion":"claims-v2-lite","claims":[],"noClaimReason":"","summary":"","warnings":[]}',
    'Each claim: {"claimType":"","evidenceOrigin":"","evidenceType":"","studyContext":"","polarity":"","direction":"","cancerType":"","biomarkerMention":"","drugOrInterventionMention":"","outcomeMention":"","statisticalEvidenceMention":"","sampleSizeMention":"","exactEvidenceSentence":"","reviewPriority":"","confidence":0}',
    'Allowed values:',
    'claimType = treatment_response, resistance, prognosis, risk, progression, diagnosis, biology, studied_with, unclear',
    'evidenceOrigin = this_study_result, cited_prior_work, background, methods_only, hypothesis_or_speculation, review_summary, unclear',
    'evidenceType = clinical, preclinical, computational, review, case_report, unclear',
    'studyContext = human_cohort, clinical_trial, cell_line, animal, organoid, mixed, unclear',
    'polarity = affirmed, negated, speculative, uncertain',
    'direction = increased, decreased, associated, no_association, mixed, unclear',
    'reviewPriority = high, medium, low',
    'Rules:',
    '- Return 0 to 2 claims total.',
    '- Each claim must use one complete candidate sentence copied exactly as exactEvidenceSentence.',
    '- Extract a claim when the candidate sentence directly states a cancer-related finding or cited finding.',
    '- Prefer zero claims only when all candidate sentences are methods-only, bibliometric-only, vague, duplicated, or require inference.',
    '- Do not extract study objectives, eligibility criteria, treatment regimens, dose ranges, follow-up duration, search methods, citation clusters, or general study characteristics unless tied to response, survival, recurrence, toxicity, local control, progression, diagnosis, risk, resistance, or another outcome.',
    '- Use evidenceOrigin="background", "cited_prior_work", or "review_summary" and reviewPriority="low" for cited or review-style claims unless the sentence reports this study\'s own result.',
    '- Use evidenceOrigin="this_study_result" only for the authors\' own reported results. Use "cited_prior_work", "background", or "review_summary" for prior studies, general knowledge, or review synthesis.',
    '- For a direct exact-sentence claim, confidence should usually be 0.5 to 0.9. Use confidence below 0.5 only if the sentence is ambiguous.',
    '- Do not write a claim-like summary while returning claims: [].',
    '- Omit unknown optional fields. Never use null or placeholder values like N/A, unknown, or not mentioned.',
    'Candidate sentences are listed below. exactEvidenceSentence must equal one candidate sentence exactly; do not include numbering, bullets, quotes, or extra text.',
    ...candidateSentences.map((sentence) => `<sentence>${sentence}</sentence>`)
  ].join('\n');
}

export function selectCandidateEvidenceSentences(sourceText: string, limit = 5): string[] {
  const sentences = sourceText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 700 && CANDIDATE_SENTENCE_TERMS.test(sentence) && CANCER_TERMS.test(sentence));
  const scored = sentences.map((sentence, index) => {
    let score = 0;
    if (CANCER_TERMS.test(sentence)) score += 3;
    if (CLAIM_OPPORTUNITY_TERMS.test(sentence)) score += 3;
    if (/\b(p\s*[<=>]|P\s*[<=>]|AUC|ORR|PFS|OS|IC50|hazard ratio|HR|%|months?|survival|toxicit|local control|recurrence|progression|response|resistance)\b/i.test(sentence)) score += 2;
    if (/\b(methods?|included|eligible|criteria|search|database|Table|Figure|Supplementary|cluster|citation|keyword|author|country|journal)\b/i.test(sentence)) score -= 2;
    return { sentence, index, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((entry) => entry.sentence);
}

export type PacketTriageInput = {
  sourceText: string;
  title?: string;
  sourceCitation?: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
};

export function triagePacketLocally(input: PacketTriageInput | string, legacyTitle = ''): PacketTriage {
  const packet = typeof input === 'string' ? { sourceText: input, title: legacyTitle } : input;
  const metadataText = [packet.title, packet.sourceCitation, packet.sourceUrl, packet.sourcePublishedAt].filter(Boolean).join('\n');
  const text = `${metadataText}\n${packet.sourceText}`;
  const lowerTitle = (packet.title ?? '').toLowerCase();
  const lower = text.toLowerCase();
  const hasCancerTerms = CANCER_TERMS.test(text);
  const hasClaimTerms = CLAIM_OPPORTUNITY_TERMS.test(text);
  const base = { schemaVersion: 'packet-triage-v1' as const, cancerRelevance: hasCancerTerms ? 0.7 : 0, claimOpportunity: hasCancerTerms && hasClaimTerms ? 0.65 : 0.1, warnings: [] as string[] };
  if (/correction|erratum|corrigendum/.test(lowerTitle) || /following publication of the original article/.test(lower)) return { ...base, decision: 'skip_correction_notice', cancerRelevance: Math.min(base.cancerRelevance, 0.2), claimOpportunity: 0.05, reason: 'Correction or figure-caption notice without extractable cancer claim.', suggestedNoClaimReason: 'no_cancer_claim' };
  if (/ethical|ethics|privacy|consent/.test(lowerTitle)) return { ...base, decision: 'skip_ethics_or_consent', claimOpportunity: 0.05, reason: 'Ethics, privacy, or consent section is not a claim opportunity.', suggestedNoClaimReason: 'methods_only' };
  if (!hasCancerTerms) return { ...base, decision: 'skip_non_cancer', reason: 'No cancer-relevance terms found in packet.', suggestedNoClaimReason: 'no_cancer_claim' };
  if (hasClaimTerms) return { ...base, decision: 'extract_now', reason: 'Cancer-relevance and claim-opportunity terms are present.' };
  if (/participants?|recruitment|eligibility/.test(lowerTitle)) return { ...base, decision: 'skip_recruitment_or_participants', claimOpportunity: 0.1, reason: 'Recruitment or participant-description section is not a claim opportunity.', suggestedNoClaimReason: 'methods_only' };
  if (/data collection|analysis|methods? and materials|materials and methods|climate|study population|sampling/.test(lowerTitle)) return { ...base, decision: 'skip_methods_only', claimOpportunity: 0.1, reason: 'Methods or context-only section is unlikely to contain grounded cancer claims.', suggestedNoClaimReason: 'methods_only' };
  if (/qualitative|process evaluation|interview|focus group/.test(lowerTitle) || /qualitative process evaluation|semi-structured interviews/.test(lower)) return { ...base, decision: 'skip_qualitative_or_process_section', claimOpportunity: 0.1, reason: 'Qualitative/process section is outside the cancer-claim extraction target.', suggestedNoClaimReason: 'insufficient_context' };
  if (!hasClaimTerms) return { ...base, decision: 'low_opportunity', reason: 'Cancer terms are present, but no clear claim-opportunity terms were found.', suggestedNoClaimReason: 'insufficient_context' };
  return { ...base, decision: 'extract_now', reason: 'Cancer-relevance and claim-opportunity terms are present.' };
}

export function emptyClaimsV2FromTriage(triage: PacketTriage): ResultPayloadV2 {
  return resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: [], noClaimReason: triage.suggestedNoClaimReason ?? 'extraction_uncertain', summary: `Worker triage: ${triage.reason}`, warnings: [`packet_triage:${triage.decision}`, ...triage.warnings] });
}

export function extractJsonBlock(raw: string): string {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('local_llm_invalid_json');
  return raw.slice(first, last + 1);
}

export function parseLocalLlmJson(raw: string): unknown {
  try {
    return JSON.parse(extractJsonBlock(raw));
  } catch (error) {
    if (error instanceof Error && error.message === 'local_llm_invalid_json') throw error;
    throw new Error('local_llm_invalid_json');
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function requiredString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function confidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function strictConfidence(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : undefined;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function strictEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

function hasNullishOrPlaceholder(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return PLACEHOLDER_STRINGS.has(value.trim().toLowerCase());
  if (Array.isArray(value)) return value.some(hasNullishOrPlaceholder);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasNullishOrPlaceholder);
  return false;
}

function isBadEvidenceSentence(sentence: string): boolean {
  const normalized = sentence.replace(/\s+/g, ' ').trim();
  if (normalized.length < 40) return true;
  if (!/[A-Za-z]{4,}/.test(normalized)) return true;
  if (/^[A-Z]{2,}\s*\[[^\]]*\]$/.test(normalized)) return true;
  if (/^\W*[A-Z0-9]{1,6}\W*$/.test(normalized)) return true;
  if (!CANCER_TERMS.test(normalized)) return true;
  return false;
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
}

function reviewPriorityForClaim(claim: ExtractedClaim): 'high' | 'medium' | 'low' {
  if (claim.evidenceOrigin !== 'this_study_result') return 'low';
  const hasCoreEntities = Boolean(claim.cancerType && (claim.biomarkerMention || claim.drugOrInterventionMention) && (claim.outcomeMention || claim.outcomeMeasureMention));
  if ((claim.evidenceType === 'clinical' || claim.studyContext === 'human_cohort' || claim.studyContext === 'clinical_trial') && hasCoreEntities && (claim.polarity === 'affirmed' || claim.polarity === 'negated')) return 'high';
  return 'medium';
}

export function normalizeLocalLlmV2Payload(rawPayload: unknown, sourceText = ''): ResultPayloadV2 {
  const source = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
  const schemaVersion = source.schemaVersion;
  const claimsSourceRaw = Array.isArray(source.claims) ? source.claims : [];
  const claimsSource = schemaVersion === 'claims-v2' || schemaVersion === 'claims-v2-lite' ? claimsSourceRaw : [];
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((warning) => optionalString(warning)).filter((warning): warning is string => Boolean(warning)) : ['local_model_missing_warnings_array'];
  const seenEvidenceSentences = new Set<string>();
  const claims = claimsSource.filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object')).map((claim) => {
    if (hasNullishOrPlaceholder(claim)) return null;
    const exactEvidenceSentence = requiredString(claim.exactEvidenceSentence, '');
    if (isBadEvidenceSentence(exactEvidenceSentence)) return null;
    if (!exactEvidenceSentence || (sourceText && !sourceText.includes(exactEvidenceSentence))) return null;
    const evidenceKey = exactEvidenceSentence.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seenEvidenceSentences.has(evidenceKey)) return null;
    seenEvidenceSentences.add(evidenceKey);
    const claimType = strictEnum(claim.claimType, CLAIM_TYPES);
    const evidenceOrigin = strictEnum(claim.evidenceOrigin, EVIDENCE_ORIGINS);
    const evidenceType = strictEnum(claim.evidenceType, EVIDENCE_TYPES);
    const studyContext = strictEnum(claim.studyContext, STUDY_CONTEXTS);
    const polarity = strictEnum(claim.polarity, POLARITIES);
    const direction = strictEnum(claim.direction, DIRECTIONS);
    const confidenceValue = strictConfidence(claim.confidence);
    if (!claimType || !evidenceOrigin || !evidenceType || !studyContext || !polarity || !direction || confidenceValue === undefined) return null;
    const charStart = sourceText ? sourceText.indexOf(exactEvidenceSentence) : -1;
    const charEnd = charStart >= 0 ? charStart + exactEvidenceSentence.length : undefined;
    const normalized: ExtractedClaim = {
      claimType,
      evidenceOrigin,
      evidenceType,
      studyContext,
      polarity,
      direction,
      cancerType: optionalString(claim.cancerType),
      biomarkerMention: optionalString(claim.biomarkerMention),
      drugOrInterventionMention: optionalString(claim.drugOrInterventionMention),
      outcomeMention: optionalString(claim.outcomeMention),
      statisticalEvidenceMention: optionalString(claim.statisticalEvidenceMention),
      sampleSizeMention: optionalString(claim.sampleSizeMention),
      charStart: charStart >= 0 ? charStart : undefined,
      charEnd,
      exactEvidenceSentence,
      confidence: confidenceValue
    };
    const suggestedPriority = optionalEnum(claim.reviewPriority, REVIEW_PRIORITIES, reviewPriorityForClaim(normalized));
    normalized.reviewPriority = normalized.evidenceOrigin === 'this_study_result' ? suggestedPriority : 'low';
    return normalized;
  }).filter((claim): claim is ExtractedClaim => Boolean(claim));
  const cappedClaims = claims.slice(0, 2);
  if (claimsSourceRaw.length > 2 || claims.length > 2) warnings.push('local_model_returned_too_many_claims_truncated_to_2');
  if (!cappedClaims.length) warnings.push('local_model_returned_no_claims');
  const noClaimReason = cappedClaims.length ? undefined : optionalEnum(source.noClaimReason, NO_CLAIM_REASONS, 'extraction_uncertain');
  return resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: cappedClaims, noClaimReason, summary: requiredString(source.summary, cappedClaims.length ? `Extracted ${cappedClaims.length} candidate claim${cappedClaims.length === 1 ? '' : 's'} from local model output.` : 'No candidate claims extracted from local model output.'), warnings });
}

export function normalizeLocalLlmPayload(rawPayload: unknown, sourceText = ''): ResultPayload {
  const source = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
  const factsSource = Array.isArray(source.facts) ? source.facts : [];
  const facts = factsSource.filter((fact): fact is Record<string, unknown> => Boolean(fact && typeof fact === 'object')).map((fact) => {
    const evidenceSentence = requiredString(fact.evidenceSentence, '');
    if (!evidenceSentence || (sourceText && !sourceText.includes(evidenceSentence))) return null;
    const relationship = typeof fact.relationshipType === 'string' && ALLOWED_RELATIONSHIPS.has(fact.relationshipType) ? fact.relationshipType : 'unclear';
    return { cancerType: optionalString(fact.cancerType), geneOrBiomarker: optionalString(fact.geneOrBiomarker), drugOrCompound: optionalString(fact.drugOrCompound), relationshipType: relationship, evidenceSentence, confidence: confidence(fact.confidence) };
  }).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((warning) => optionalString(warning)).filter((warning): warning is string => Boolean(warning)) : [];
  if (!Array.isArray(source.warnings)) warnings.push('local_model_missing_warnings_array');
  if (!facts.length) warnings.push('local_model_returned_no_facts');
  return resultPayloadSchema.parse({ facts, summary: requiredString(source.summary, facts.length ? `Extracted ${facts.length} candidate fact${facts.length === 1 ? '' : 's'} from local model output.` : 'No candidate facts extracted from local model output.'), warnings });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason ?? new Error('local_llm_cancelled'));
  if (externalSignal?.aborted) abortFromExternal();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`local_llm_timeout:${timeoutMs}`)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw externalSignal.reason instanceof Error ? externalSignal.reason : new Error('local_llm_cancelled');
      throw new Error(`local_llm_timeout:${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function verifyLocalLlmAvailable(config: LocalLlmConfig): Promise<void> {
  const response = await fetchWithTimeout(`${config.endpoint}/api/tags`, { method: 'GET' }, config.timeoutMs);
  if (!response.ok) throw new Error(`local_llm_unavailable:${response.status}`);
  const json = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  const installed = (json.models ?? []).map((model) => model.name ?? model.model).filter(Boolean);
  if (!installed.includes(config.model)) throw new Error(`local_llm_model_missing:${config.model}`);
}

export function localLlmPromptHash(): string {
  return hashText(extractionPrompt('{{sourceText}}'));
}

export function localLlmV2PromptHash(): string {
  return hashText(extractionPromptV2('{{sourceText}}'));
}

async function generateWithPrompt(sourceText: string, prompt: string, config: LocalLlmConfig, signal?: AbortSignal, onProgress?: (progress: LocalLlmProgress) => void): Promise<unknown> {
  const response = await fetchWithTimeout(`${config.endpoint}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: config.model, prompt, stream: true, format: 'json', options: config.options }) }, config.timeoutMs, signal);
  if (!response.ok) throw new Error(`local_llm_generate_failed:${response.status}`);

  if (!response.body) {
    const json = (await response.json()) as { response?: string };
    return parseLocalLlmJson(json.response ?? '');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let raw = '';
  let chunkCount = 0;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { response?: string; done?: boolean; eval_count?: number; total_duration?: number; eval_duration?: number };
    if (event.response) {
      raw += event.response;
      chunkCount += 1;
      onProgress?.({ phase: 'streaming', responseChars: raw.length, chunkCount });
    }
    if (event.done) {
      onProgress?.({
        phase: 'completed',
        responseChars: raw.length,
        chunkCount,
        evalCount: event.eval_count,
        totalDurationMs: event.total_duration === undefined ? undefined : Math.round(event.total_duration / 1_000_000),
        evalDurationMs: event.eval_duration === undefined ? undefined : Math.round(event.eval_duration / 1_000_000)
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }
  buffer += decoder.decode();
  handleLine(buffer);
  return parseLocalLlmJson(raw);
}

export async function runLocalLlmExtractor(sourceText: string, config: LocalLlmConfig, signal?: AbortSignal, onProgress?: (progress: LocalLlmProgress) => void): Promise<ResultPayload> {
  return normalizeLocalLlmPayload(await generateWithPrompt(sourceText, extractionPrompt(sourceText), config, signal, onProgress), sourceText);
}

export async function runLocalLlmV2Extractor(sourceText: string, config: LocalLlmConfig, signal?: AbortSignal, onProgress?: (progress: LocalLlmProgress) => void): Promise<ResultPayloadV2> {
  const candidateSentences = selectCandidateEvidenceSentences(sourceText);
  const prompt = candidateSentences.length ? candidateSentencePromptV2(candidateSentences) : extractionPromptV2(sourceText);
  const normalized = normalizeLocalLlmV2Payload(await generateWithPrompt(sourceText, prompt, config, signal, onProgress), sourceText);
  normalized.warnings.push(candidateSentences.length ? `candidate_sentence_mode:${candidateSentences.length}` : 'candidate_sentence_mode:none_fallback_full_packet');
  return resultPayloadV2Schema.parse(normalized);
}

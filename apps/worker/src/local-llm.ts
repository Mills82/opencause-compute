import { DEFAULT_LOCAL_MODEL, assertApprovedModel, hashText, resultPayloadSchema, resultPayloadV2Schema, type ExtractedClaim, type ResultPayload, type ResultPayloadV2 } from '@opencause/shared';

const ALLOWED_RELATIONSHIPS = new Set([
  'associated_with_response',
  'associated_with_resistance',
  'associated_with_risk',
  'associated_with_progression',
  'studied_with',
  'unclear'
]);

export const LOCAL_LLM_PROMPT_VERSION = 'local-llm-v1-prompt-2026-05-08';
export const LOCAL_LLM_V2_PROMPT_VERSION = 'local-llm-v2-prompt-2026-05-10';

export type LocalLlmConfig = {
  endpoint: string;
  model: string;
  timeoutMs: number;
  options: OllamaGenerationOptions;
  qualityTier: 'low' | 'balanced' | 'high' | 'ultra';
};

export type OllamaGenerationOptions = {
  temperature: number;
  top_p: number;
  num_ctx: number;
  num_predict: number;
};

const DEFAULT_ENDPOINT = process.env.LOCAL_LLM_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.LOCAL_LLM_MODEL ?? DEFAULT_LOCAL_MODEL;
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? '180000');

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
      num_predict: envNumber('LOCAL_LLM_NUM_PREDICT', 3000)
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
    'These are NOT accepted scientific facts or discoveries. They are candidate claims for later independent validation and consensus.',
    'Return ONLY valid compact JSON matching this schema:',
    '{"schemaVersion":"claims-v2","claims":[{"claimType":"treatment_response|resistance|prognosis|risk|progression|diagnosis|biology|studied_with|unclear","evidenceOrigin":"this_study_result|cited_prior_work|background|methods_only|hypothesis_or_speculation|review_summary|unclear","evidenceType":"clinical|preclinical|computational|review|case_report|unclear","studyContext":"human_cohort|clinical_trial|cell_line|animal|organoid|mixed|unclear","polarity":"affirmed|negated|speculative|uncertain","direction":"increased|decreased|associated|no_association|mixed|unclear","cancerType":"optional string","biomarkerMention":"optional exact text","biomarkerNormalizedGuess":"optional non-authoritative guess","drugOrInterventionMention":"optional exact text","drugNormalizedGuess":"optional non-authoritative guess","variantMention":"optional exact text","pathwayMention":"optional exact text","cellLineMention":"optional exact text","speciesOrModelMention":"optional exact text","outcomeMention":"optional exact text","outcomeMeasureMention":"optional exact text","statisticalEvidenceMention":"optional exact text","sampleSizeMention":"optional exact text","pmid":"optional string","pmcid":"optional string","sectionTitle":"optional string","sectionType":"abstract|introduction|methods|results|discussion|conclusion|figure_table|supplement|unknown","paragraphIndex":0,"sentenceIndex":0,"charStart":0,"charEnd":0,"exactEvidenceSentence":"verbatim sentence from source","evidenceContext":"optional nearby source text","reviewPriority":"high|medium|low","confidence":0.0}],"noClaimReason":"no_cancer_claim|methods_only|background_only|insufficient_context|extraction_uncertain|other","summary":"string","warnings":[]}',
    'Optional fields may be omitted. Never use null. Do not include pseudo-JSON keys with question marks.',
    'Rules:',
    '- Return 0 to 8 claims. Fewer high-quality grounded claims are better than filling the list.',
    '- exactEvidenceSentence must be copied exactly from source text. If no exact sentence supports a claim, omit the claim.',
    '- evidenceContext, if present, must also be copied exactly from nearby source text.',
    '- Preserve exact mentions separately from normalized guesses. Normalized guesses are not authoritative.',
    '- Label evidenceOrigin carefully: this study result, cited prior work, background, methods-only, speculation, review summary, or unclear.',
    '- Methods-only mentions may be labeled methods_only, but do not turn them into scientific findings.',
    '- Separate negated and speculative claims from affirmed claims using polarity and direction.',
    '- Prefer cancer-relevant claims involving cancer type, biomarkers, variants, pathways, drugs/interventions, outcomes, clinical/preclinical context, or statistical evidence.',
    '- Do not infer beyond the source. Return zero claims if there are no grounded cancer-relevant claims.',
    '- If claims is empty, include noClaimReason.',
    '- Output JSON only. No markdown or commentary.',
    'Source text follows:',
    sourceText
  ].join('\n');
}

export function extractJsonBlock(raw: string): string {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('local_llm_invalid_json');
  return raw.slice(first, last + 1);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function confidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
}

function reviewPriorityForClaim(claim: ExtractedClaim): 'high' | 'medium' | 'low' {
  const hasCoreEntities = Boolean(claim.cancerType && (claim.biomarkerMention || claim.drugOrInterventionMention) && (claim.outcomeMention || claim.outcomeMeasureMention));
  if (claim.evidenceOrigin === 'this_study_result' && (claim.evidenceType === 'clinical' || claim.studyContext === 'human_cohort' || claim.studyContext === 'clinical_trial') && hasCoreEntities && (claim.polarity === 'affirmed' || claim.polarity === 'negated')) return 'high';
  if (claim.evidenceOrigin === 'methods_only' || claim.evidenceOrigin === 'background') return 'low';
  return 'medium';
}

export function normalizeLocalLlmV2Payload(rawPayload: unknown, sourceText = ''): ResultPayloadV2 {
  const source = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
  const claimsSourceRaw = Array.isArray(source.claims) ? source.claims : [];
  const claimsSource = claimsSourceRaw.slice(0, 8);
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((warning) => optionalString(warning)).filter((warning): warning is string => Boolean(warning)) : ['local_model_missing_warnings_array'];
  const claims = claimsSource.filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object')).map((claim) => {
    const exactEvidenceSentence = requiredString(claim.exactEvidenceSentence, '');
    if (!exactEvidenceSentence || (sourceText && !sourceText.includes(exactEvidenceSentence))) return null;
    const evidenceContext = optionalString(claim.evidenceContext);
    const normalized: ExtractedClaim = {
      claimType: optionalEnum(claim.claimType, ['treatment_response','resistance','prognosis','risk','progression','diagnosis','biology','studied_with','unclear'] as const, 'unclear'),
      evidenceOrigin: optionalEnum(claim.evidenceOrigin, ['this_study_result','cited_prior_work','background','methods_only','hypothesis_or_speculation','review_summary','unclear'] as const, 'unclear'),
      evidenceType: optionalEnum(claim.evidenceType, ['clinical','preclinical','computational','review','case_report','unclear'] as const, 'unclear'),
      studyContext: optionalEnum(claim.studyContext, ['human_cohort','clinical_trial','cell_line','animal','organoid','mixed','unclear'] as const, 'unclear'),
      polarity: optionalEnum(claim.polarity, ['affirmed','negated','speculative','uncertain'] as const, 'uncertain'),
      direction: optionalEnum(claim.direction, ['increased','decreased','associated','no_association','mixed','unclear'] as const, 'unclear'),
      cancerType: optionalString(claim.cancerType),
      biomarkerMention: optionalString(claim.biomarkerMention),
      biomarkerNormalizedGuess: optionalString(claim.biomarkerNormalizedGuess),
      drugOrInterventionMention: optionalString(claim.drugOrInterventionMention),
      drugNormalizedGuess: optionalString(claim.drugNormalizedGuess),
      variantMention: optionalString(claim.variantMention),
      pathwayMention: optionalString(claim.pathwayMention),
      cellLineMention: optionalString(claim.cellLineMention),
      speciesOrModelMention: optionalString(claim.speciesOrModelMention),
      outcomeMention: optionalString(claim.outcomeMention),
      outcomeMeasureMention: optionalString(claim.outcomeMeasureMention),
      statisticalEvidenceMention: optionalString(claim.statisticalEvidenceMention),
      sampleSizeMention: optionalString(claim.sampleSizeMention),
      pmid: optionalString(claim.pmid),
      pmcid: optionalString(claim.pmcid),
      sectionTitle: optionalString(claim.sectionTitle),
      sectionType: optionalEnum(claim.sectionType, ['abstract','introduction','methods','results','discussion','conclusion','figure_table','supplement','unknown'] as const, 'unknown'),
      paragraphIndex: optionalNumber(claim.paragraphIndex),
      sentenceIndex: optionalNumber(claim.sentenceIndex),
      charStart: optionalNumber(claim.charStart),
      charEnd: optionalNumber(claim.charEnd),
      exactEvidenceSentence,
      evidenceContext: evidenceContext && (!sourceText || sourceText.includes(evidenceContext)) ? evidenceContext : undefined,
      confidence: confidence(claim.confidence)
    };
    normalized.reviewPriority = optionalEnum(claim.reviewPriority, ['high','medium','low'] as const, reviewPriorityForClaim(normalized));
    return normalized;
  }).filter((claim): claim is ExtractedClaim => Boolean(claim));
  if (claimsSourceRaw.length > 8) warnings.push('local_model_returned_too_many_claims_truncated_to_8');
  if (!claims.length) warnings.push('local_model_returned_no_claims');
  const noClaimReason = claims.length ? undefined : optionalEnum(source.noClaimReason, ['no_cancer_claim','methods_only','background_only','insufficient_context','extraction_uncertain','other'] as const, 'extraction_uncertain');
  return resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims, noClaimReason, summary: requiredString(source.summary, claims.length ? `Extracted ${claims.length} candidate claim${claims.length === 1 ? '' : 's'} from local model output.` : 'No candidate claims extracted from local model output.'), warnings });
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

async function generateWithPrompt(sourceText: string, prompt: string, config: LocalLlmConfig, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithTimeout(`${config.endpoint}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: config.model, prompt, stream: false, format: 'json', options: config.options }) }, config.timeoutMs, signal);
  if (!response.ok) throw new Error(`local_llm_generate_failed:${response.status}`);
  const json = (await response.json()) as { response?: string };
  return JSON.parse(extractJsonBlock(json.response ?? ''));
}

export async function runLocalLlmExtractor(sourceText: string, config: LocalLlmConfig, signal?: AbortSignal): Promise<ResultPayload> {
  return normalizeLocalLlmPayload(await generateWithPrompt(sourceText, extractionPrompt(sourceText), config, signal), sourceText);
}

export async function runLocalLlmV2Extractor(sourceText: string, config: LocalLlmConfig, signal?: AbortSignal): Promise<ResultPayloadV2> {
  return normalizeLocalLlmV2Payload(await generateWithPrompt(sourceText, extractionPromptV2(sourceText), config, signal), sourceText);
}

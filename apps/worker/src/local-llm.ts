import { DEFAULT_LOCAL_MODEL, assertApprovedModel, hashText, resultPayloadV2Schema, type ExtractedClaim, type PacketTriage, type ResultPayload, type ResultPayloadV2 } from '@opencause/shared';

export const LOCAL_LLM_V2_PROMPT_VERSION = 'local-llm-v2-lite.2-prompt-2026-05-14a';

const CLAIM_TYPES = ['treatment_response','resistance','prognosis','risk','progression','diagnosis','biology','toxicity','local_control','studied_with','unclear'] as const;
const EVIDENCE_ORIGINS = ['this_study_result','cited_prior_work','background','methods_only','hypothesis_or_speculation','review_summary','unclear'] as const;
const EVIDENCE_TYPES = ['clinical','preclinical','computational','review','case_report','unclear'] as const;
const STUDY_CONTEXTS = ['human_cohort','clinical_trial','cell_line','animal','organoid','mixed','unclear'] as const;
const POLARITIES = ['affirmed','negated','speculative','uncertain'] as const;
const DIRECTIONS = ['increased','decreased','associated','no_association','mixed','unclear'] as const;
const REVIEW_PRIORITIES = ['high','medium','low'] as const;
const NO_CLAIM_REASONS = ['no_cancer_claim','methods_only','background_only','insufficient_context','extraction_uncertain','other'] as const;
const PLACEHOLDER_STRINGS = new Set(['n/a', 'na', 'none', 'null', 'unknown', 'not mentioned', 'not applicable', 'not provided']);
const CANCER_TERMS = /\b(cancer|tumou?r|neoplasm|oncolog|carcinoma|sarcoma|melanoma|leukemia|leukaemia|lymphoma|glioma|glioblastoma|gbm|hggs?|meningioma|brain\s+tumou?r|cns\s+tumou?r|myeloma|metasta|malignan|tnbc|luad|stad|oscc|hcc|nsclc|sclc|egfr|alk|brca|pd-?l1|her2|kras|braf|renal\s+cell|renal\s+carcinoma|kidney\s+cancer|renal\s+cancer|\brcc\b|urothelial|colorectal|crc|pancreatic|ovarian|prostate|endometrial|cervical|esophageal|oesophageal|head\s+and\s+neck)\b/i;
const CLAIM_OPPORTUNITY_TERMS = /\b(response|resistan|survival|prognos|risk|progression|diagnos|associated|correlat|predict|biomarker|mutation|variant|expression|therapy|treatment|drug|inhibitor|immunotherapy|chemotherapy|radiotherapy|proton\s+therapy|radiation\s+dose|toxicit|local\s+control|recurrence|metasta|overall survival|progression-free survival|objective response|response rate|pfs|os|orr|adverse events?|disease control|hazard ratio|clinical trial|phase\s+(?:i|ii|iii|iv|1|2|3|4))\b/i;
const STRONG_ONCOLOGY_OUTCOME_TERMS = /\b(ORR|objective response rate|overall response rate|response rate|PFS|progression-free survival|OS|overall survival|median survival|survival rates?|hazard ratio|\bHR\b|disease control|complete response|partial response|grade\s+[34]|adverse events?|toxicit|clinical trial|Phase\s+(?:I|II|III|IV|1|2|3|4)|sunitinib|axitinib|avelumab|pembrolizumab|nivolumab|ipilimumab|atezolizumab|durvalumab|trastuzumab|bevacizumab|osimertinib|erlotinib|gefitinib|cetuximab|rituximab|olaparib|imatinib)\b/i;

const NON_RESULT_SENTENCE_TERMS = /\b((?:aim|objective|purpose)\s+of\s+(?:this\s+)?study\s+was|(?:objective|purpose)\s+was|designed\s+to\s+evaluate|we\s+hypothesized|hypothesized\s+that|may\s+predict|warrants?\s+further\s+investigation|future\s+(?:studies|research)|eligible\s+patients|patients\s+(?:with|who|that)\b.*\b(?:were\s+included|were\s+eligible|were\s+enrolled|were\s+selected)|inclusion\s+criteria|exclusion\s+criteria|baseline\b|at\s+baseline|median\s+age|follow-up\s+duration|median\s+follow-up|was\s+estimated\s+using|were\s+estimated\s+using|kaplan[- ]meier|log-rank|cox\s+(?:proportional\s+hazards\s+)?model|we\s+searched\s+(?:pubmed|embase|web\s+of\s+science)|database\s+search)\b/i;
const METHODS_ACTION_TERMS = /\b(?:we\s+)?(?:injected|generated|transfected|cultured|isolated|seeded|plated|cloned|constructed|prepared|collected|obtained|purchased|stained|fixed|embedded|sectioned|washed|incubated|euthanized|housed|administered)\b/i;
const STUDY_CONTEXT_ANIMAL_TERMS = /\b(mice|mouse|murine|rat|rats|xenograft|tumou?r-bearing|in\s+vivo|aav9|apc\s*min|kpc|orthotopic|syngeneic|animal model)\b/i;
const STUDY_CONTEXT_CELL_TERMS = /\b(cell lines?|cells?\b|in\s+vitro|organoid|spheroid|mda-mb-231|c2c12|mcf10a|kpc;|4t1|c26|hek293|hela)\b/i;
const STUDY_CONTEXT_HUMAN_TERMS = /\b(patients?|cohort|clinical trial|phase\s+(?:i|ii|iii|iv|1|2|3|4)|randomi[sz]ed|retrospective|prospective|enrolled|median age|human|overall survival|\bOS\b|progression-free survival|\bPFS\b|Kaplan-Meier)\b/i;
const RESULT_ASSERTION_TERMS = /\b(was|were)\s+(?:significantly\s+)?(?:associated\s+with|higher|lower|more\s+frequent|less\s+frequent|improved|reduced|increased|decreased)|\b(?:improved|reduced|increased|decreased|occurred\s+in|resulted\s+in|demonstrated|showed|achieved|identified|revealed|distinguished)\b|\b(?:ORR|objective response rate|response rate|PFS|progression-free survival|OS|overall survival|median overall survival|hazard ratio|\bHR\b|AUC)\s+(?:was|of|=)|\b(?:P\s*[<=>]|p\s*[<=>])\b/i;
const CANDIDATE_SENTENCE_TERMS = new RegExp(String.raw`${CANCER_TERMS.source}|${CLAIM_OPPORTUNITY_TERMS.source}|\b(IC50|ORR|PFS|OS|hazard ratio|HR|AUC|sensitivity|specificity|apoptosis|proliferation|migration|invasion|tumor growth|tumour growth|antitumor|anti-tumor|chemoresistance|radiosensiti[sz]ation)\b`, 'i');

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
    allowExperimental: process.env.ALLOW_EXPERIMENTAL_LOCAL_MODEL === 'true',
    allowCandidate: process.env.OPENCAUSE_ALLOW_CANDIDATE_LOCAL_MODEL === 'true'
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

export function extractionPromptV2(sourceText: string): string {
  return [
    'You extract candidate oncology evidence from source text for later human/model review.',
    'These are NOT accepted medical facts. Extract direct candidate evidence statements; later systems will validate them.',
    'Return ONLY valid JSON. No markdown. No commentary.',
    'JSON shape: {"schemaVersion":"claims-v2-lite.2","claims":[],"noClaimReason":"","warnings":[]}',
    'Each claim: {"evidenceSentence":"","whyRelevant":"","claimKind":"","cancer":"","subject":"","interventionOrExposure":"","outcome":"","effectText":"","evidenceLevel":"","confidence":0}',
    'Allowed claimKind: treatment, prognosis, biomarker, toxicity, biology, resistance, local_control, risk, diagnosis, other',
    'Allowed evidenceLevel: human, animal, cell, computational, review, unclear',
    'Extract when a sentence directly states association with survival, prognosis, response, resistance, toxicity/adverse events, recurrence, local control, tumor growth, biomarker status, or treatment effect.',
    'Do not require proof that the statement is true. If the source directly states it, extract it as candidate evidence.',
    'Do not extract pure methods, eligibility, definitions, abbreviations, captions that only list terms, or future-work speculation.',
    'evidenceSentence must be one complete sentence copied exactly from the source text.',
    'Return 0 to 3 claims. If none, set noClaimReason.',
    'Examples:',
    '{"schemaVersion":"claims-v2-lite.2","claims":[{"evidenceSentence":"Kaplan-Meier survival analysis revealed that melanoma patients with elevated CD73 expression exhibited significantly worse prognosis.","whyRelevant":"Direct biomarker-prognosis association in melanoma.","claimKind":"prognosis","cancer":"melanoma","subject":"elevated CD73 expression","outcome":"worse prognosis","effectText":"associated with worse prognosis","evidenceLevel":"human","confidence":0.82}],"warnings":[]}',
    '{"schemaVersion":"claims-v2-lite.2","claims":[{"evidenceSentence":"Neutralization of GDF-15 with the anti-GDF-15 antibody significantly reversed body weight loss in tumour-bearing mice.","whyRelevant":"Direct treatment effect in an animal cancer-cachexia model.","claimKind":"treatment","cancer":"cancer cachexia","interventionOrExposure":"anti-GDF-15 antibody","outcome":"body weight loss","effectText":"significantly reversed","evidenceLevel":"animal","confidence":0.86}],"warnings":[]}',
    '{"schemaVersion":"claims-v2-lite.2","claims":[{"evidenceSentence":"An increasing number of reported severe sunburns during childhood was significantly associated with a longer OS.","whyRelevant":"Direct clinical prognosis/survival association.","claimKind":"prognosis","cancer":"metastatic melanoma","subject":"severe sunburns during childhood","outcome":"overall survival","effectText":"associated with longer OS","evidenceLevel":"human","confidence":0.78}],"warnings":[]}',
    'Source text follows:',
    sourceText
  ].join('\n');
}

export function candidateSentencePromptV2(candidateSentences: string[], context: PacketContext = {}): string {
  const contextLines = [
    context.title ? `Title: ${context.title}` : undefined,
    context.sectionTitle ? `Section: ${context.sectionTitle}` : undefined,
    context.sourceCitation ? `Citation: ${context.sourceCitation}` : undefined
  ].filter(Boolean);
  return [
    'You extract candidate oncology evidence from candidate sentences for an AI-readable evidence index.',
    'These are NOT accepted medical facts. They are candidate evidence records for later validation.',
    'Return ONLY valid JSON. No markdown. No commentary.',
    'JSON shape: {"schemaVersion":"claims-v2-lite.2","claims":[],"noClaimReason":"","warnings":[]}',
    'Each claim: {"evidenceSentence":"","whyRelevant":"","claimKind":"","cancer":"","subject":"","interventionOrExposure":"","outcome":"","effectText":"","evidenceLevel":"","confidence":0}',
    'Allowed claimKind: treatment, prognosis, biomarker, toxicity, biology, resistance, local_control, risk, diagnosis, other',
    'Allowed evidenceLevel: human, animal, cell, computational, review, unclear',
    'Extract when a sentence directly states association with survival, prognosis, response, resistance, toxicity/adverse events, recurrence, local control, tumor growth, biomarker status, or treatment effect.',
    'Do not require proof that the statement is true. If a candidate sentence directly states a relationship/outcome, extract it as candidate evidence.',
    'Good extraction targets include: "associated with longer OS", "worse prognosis", "improved progression-free survival", "reversed body weight loss", "reduced tumor growth", "toxicity occurred", "local control improved".',
    'Do not extract pure methods, eligibility, definitions, abbreviation lists, or future-work speculation.',
    'evidenceSentence must exactly equal one complete candidate sentence below. Do not paraphrase.',
    'Return 0 to 3 claims total. If none, set noClaimReason.',
    'Few-shot examples:',
    '<sentence>Kaplan-Meier survival analysis revealed that melanoma patients with elevated CD73 expression exhibited significantly worse prognosis.</sentence> -> {"evidenceSentence":"Kaplan-Meier survival analysis revealed that melanoma patients with elevated CD73 expression exhibited significantly worse prognosis.","whyRelevant":"Direct biomarker-prognosis association in melanoma.","claimKind":"prognosis","cancer":"melanoma","subject":"elevated CD73 expression","outcome":"worse prognosis","effectText":"associated with worse prognosis","evidenceLevel":"human","confidence":0.82}',
    '<sentence>Neutralization of GDF-15 with the anti-GDF-15 antibody significantly reversed body weight loss in tumour-bearing mice.</sentence> -> {"evidenceSentence":"Neutralization of GDF-15 with the anti-GDF-15 antibody significantly reversed body weight loss in tumour-bearing mice.","whyRelevant":"Direct treatment effect in an animal cancer-cachexia model.","claimKind":"treatment","cancer":"cancer cachexia","interventionOrExposure":"anti-GDF-15 antibody","outcome":"body weight loss","effectText":"significantly reversed","evidenceLevel":"animal","confidence":0.86}',
    '<sentence>An increasing number of reported severe sunburns during childhood was significantly associated with a longer OS.</sentence> -> {"evidenceSentence":"An increasing number of reported severe sunburns during childhood was significantly associated with a longer OS.","whyRelevant":"Direct clinical prognosis/survival association.","claimKind":"prognosis","cancer":"metastatic melanoma","subject":"severe sunburns during childhood","outcome":"overall survival","effectText":"associated with longer OS","evidenceLevel":"human","confidence":0.78}',
    ...(contextLines.length ? ['Context:', ...contextLines] : []),
    'Candidate sentences:',
    ...candidateSentences.map((sentence) => `<sentence>${sentence}</sentence>`)
  ].join('\n');
}

export type PacketContext = { title?: string; sectionTitle?: string; sectionType?: string; paragraphIndex?: number; sourceCitation?: string; sourceUrl?: string; sourcePublishedAt?: string };

export function selectCandidateEvidenceSentences(sourceText: string, limit = 8, contextText = ''): string[] {
  const sentences = sourceText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 700 && CANDIDATE_SENTENCE_TERMS.test(sentence) && (CANCER_TERMS.test(sentence) || CANCER_TERMS.test(contextText)));
  const scored = sentences.map((sentence, index) => {
    let score = 0;
    if (CANCER_TERMS.test(sentence)) score += 3;
    else if (CANCER_TERMS.test(contextText)) score += 1;
    if (CLAIM_OPPORTUNITY_TERMS.test(sentence)) score += 3;
    if (/\b(p\s*[<=>]|P\s*[<=>]|AUC|ORR|PFS|OS|IC50|hazard ratio|HR|%|months?|survival|toxicit|local control|recurrence|progression|response|resistance)\b/i.test(sentence)) score += 2;
    if (/\b(methods?|included|eligible|criteria|search|database|dataset|GEO|Table|Figure|Supplementary|cluster|citation|keyword|author|country|journal)\b/i.test(sentence)) score -= 2;
    if (/\b(significant|significantly|associated|correlated|predict|improved|worse|poor|reduced|inhibited|promoted|increased|decreased)\b/i.test(sentence)) score += 1;
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


function evidenceCancerSupport(sentence: string, contextText = ''): { valid: boolean; warning?: string } {
  const normalized = sentence.replace(/\s+/g, ' ').trim();
  if (CANCER_TERMS.test(normalized) || CANCER_TERMS.test(contextText)) return { valid: true };
  if (STRONG_ONCOLOGY_OUTCOME_TERMS.test(normalized) && (CLAIM_OPPORTUNITY_TERMS.test(normalized) || CLAIM_OPPORTUNITY_TERMS.test(contextText))) {
    return { valid: true, warning: 'weak_cancer_lexicon_match_strong_oncology_outcome' };
  }
  return { valid: false };
}

function isBadEvidenceSentence(sentence: string, contextText = ''): boolean {
  const normalized = sentence.replace(/\s+/g, ' ').trim();
  if (normalized.length < 40) return true;
  if (!/[A-Za-z]{4,}/.test(normalized)) return true;
  if (/^[A-Z]{2,}\s*\[[^\]]*\]$/.test(normalized)) return true;
  if (/^\W*[A-Z0-9]{1,6}\W*$/.test(normalized)) return true;
  if (!evidenceCancerSupport(normalized, contextText).valid) return true;
  return false;
}


function inferCancerTypeFromText(text: string): string | undefined {
  const normalized = text.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\b(glioblastoma|gbm)\b/, 'glioblastoma'],
    [/\btriple[-‐ ]negative breast cancer|\btnbc\b/, 'triple-negative breast cancer'],
    [/\bbreast cancer\b/, 'breast cancer'],
    [/\bgastric cancer\b|\bstomach cancer\b|\bstad\b/, 'gastric cancer'],
    [/\blung adenocarcinoma\b|\bluad\b/, 'lung adenocarcinoma'],
    [/\bnon-small cell lung cancer\b|\bnsclc\b/, 'non-small cell lung cancer'],
    [/\blung cancer\b/, 'lung cancer'],
    [/\boral squamous cell carcinoma\b|\boscc\b/, 'oral squamous cell carcinoma'],
    [/\bhepatocellular carcinoma\b|\bhcc\b/, 'hepatocellular carcinoma'],
    [/\bmelanoma\b/, 'melanoma'],
    [/\bleukemia\b|\bleukaemia\b/, 'leukemia'],
    [/\blymphoma\b/, 'lymphoma']
  ];
  return patterns.find(([pattern]) => pattern.test(normalized))?.[1];
}


function isNonResultClaimSentence(sentence: string, claim: Record<string, unknown>): boolean {
  const normalized = sentence.replace(/\s+/g, ' ').trim();
  const evidenceOrigin = typeof claim.evidenceOrigin === 'string' ? claim.evidenceOrigin : '';
  const evidenceRole = typeof claim.evidenceRole === 'string' ? claim.evidenceRole : '';
  if (evidenceOrigin === 'methods_only' || evidenceOrigin === 'hypothesis_or_speculation' || evidenceRole === 'method_or_design' || evidenceRole === 'hypothesis') return true;
  if (METHODS_ACTION_TERMS.test(normalized) && !RESULT_ASSERTION_TERMS.test(normalized)) return true;
  if (!NON_RESULT_SENTENCE_TERMS.test(normalized)) return false;
  return !RESULT_ASSERTION_TERMS.test(normalized);
}


function inferEvidenceOrigin(sentence: string, context: PacketContext, fallback: unknown): unknown {
  const text = [context.sectionTitle, context.sectionType, sentence].filter(Boolean).join(' ');
  if (/\b(our study|we found|we demonstrate|we demonstrated|we show|we showed|our results|results showed|this study (shows|showed|demonstrates)|we identified|we observed)\b/i.test(text)) return 'this_study_result';
  if (/\b(systematic review|review|meta-analysis)\b/i.test(text) || /\b(review|introduction|background)\b/i.test(String(context.sectionTitle ?? ''))) return 'review_summary';
  if (/\b(previous studies|previously reported|prior studies|recent study|in vitro study indicated|has been shown|is known to|reported that|demonstrated that)\b/i.test(text)) return 'cited_prior_work';
  if (/\[\s*[,;]?\s*\]|\([^)]*et al\.?[^)]*\)/i.test(sentence)) return 'cited_prior_work';
  return fallback;
}

function inferEvidenceType(sentence: string, context: PacketContext, fallback: unknown): unknown {
  const text = [context.title, context.sectionTitle, sentence].filter(Boolean).join(' ');
  if (/\b(computational|network-based|model|prediction model|algorithm|in silico|bioinformatic|transcriptomic|RNA-seq|miRNA|pathway analysis|benchmark)\b/i.test(text) && !STUDY_CONTEXT_HUMAN_TERMS.test(text) && !STUDY_CONTEXT_CELL_TERMS.test(text) && !STUDY_CONTEXT_ANIMAL_TERMS.test(text)) return 'computational';
  if (STUDY_CONTEXT_HUMAN_TERMS.test(text)) return 'clinical';
  if (STUDY_CONTEXT_CELL_TERMS.test(text) || STUDY_CONTEXT_ANIMAL_TERMS.test(text)) return 'preclinical';
  if (/\b(review|meta-analysis)\b/i.test(text)) return 'review';
  return fallback;
}

function inferClaimType(claim: Record<string, unknown>, sentence: string, fallback: unknown): unknown {
  const text = [sentence, optionalString(claim.outcome), optionalString(claim.outcomeMention), optionalString(claim.effectText)].filter(Boolean).join(' ');
  if (/\bresistan(?:ce|t)|MEK inhibitors?|immunotherapy resistance\b/i.test(text)) return 'resistance';
  if (/\b(prognos|overall survival|\bOS\b|progression-free survival|\bPFS\b|survival|metastatic potential)\b/i.test(text)) return 'prognosis';
  if (/\b(toxicit|adverse events?|grade\s+[34])\b/i.test(text)) return 'toxicity';
  if (/\blocal control\b/i.test(text)) return 'local_control';
  if (/\b(reduced tumou?r growth|tumou?r cell death|prolonged survival|response rate|objective response|reversed body weight loss|restored fat mass)\b/i.test(text)) return 'treatment_response';
  if (/\b(apoptosis|miRNA|pathway|signaling|expression|mediator|regulat(?:es|ion|ory)|mutation|biomarker)\b/i.test(text)) return 'biology';
  return fallback;
}

function inferStudyContext(claim: Record<string, unknown>, sentence: string, fallback: unknown): unknown {
  const text = [sentence, optionalString(claim.populationOrModel), optionalString(claim.speciesOrModelMention), optionalString(claim.evidenceLevel)].filter(Boolean).join(' ');
  if (/\bclinical trial|phase\s+(?:i|ii|iii|iv|1|2|3|4)|randomi[sz]ed\b/i.test(text)) return 'clinical_trial';
  if (STUDY_CONTEXT_HUMAN_TERMS.test(text)) return 'human_cohort';
  if (/\borganoid|spheroid\b/i.test(text)) return 'organoid';
  if (STUDY_CONTEXT_ANIMAL_TERMS.test(text)) return 'animal';
  if (STUDY_CONTEXT_CELL_TERMS.test(text)) return 'cell_line';
  return fallback;
}

function isLowValueClaimSentence(sentence: string, claim: Record<string, unknown>): boolean {
  const normalized = sentence.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const hasSpecificEntity = Boolean(optionalString(claim.biomarkerMention) || optionalString(claim.drugOrInterventionMention) || optionalString(claim.outcomeMention) || optionalString(claim.statisticalEvidenceMention));
  if (/\b(is|are|remains|represents)\b.*\b(common|aggressive|poor prognosis|heterogeneity|invasiveness|mortality|morbidity)\b/i.test(normalized) && !hasSpecificEntity) return true;
  if (/\b(dataset|database|GEO|TCGA|obtained from|consists of|comprises|encompasses|included|samples?)\b/i.test(normalized) && !/\b(significant|significantly|associated|correlated|survival|response|resistance|progression|prognos|risk|diagnos|inhibited|reduced|promoted|increased|decreased)\b/i.test(normalized)) return true;
  if (/^figure\s+s?\d+/i.test(lower) && !/\b(significant|significantly|inhibited|reduced|promoted|increased|decreased|associated|survival|response|resistance)\b/i.test(lower)) return true;
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

export function normalizeLocalLlmV2Payload(rawPayload: unknown, sourceText = '', context: PacketContext = {}): ResultPayloadV2 {
  const source = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
  const schemaVersion = source.schemaVersion;
  const claimsSourceRaw = Array.isArray(source.claims) ? source.claims : [];
  const claimsSource = schemaVersion === 'claims-v2' || schemaVersion === 'claims-v2-lite' || schemaVersion === 'claims-v2-lite.1' || schemaVersion === 'claims-v2-lite.2' ? claimsSourceRaw : [];
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((warning) => optionalString(warning)).filter((warning): warning is string => Boolean(warning)) : ['local_model_missing_warnings_array'];
  const diagnostics: Array<{ code: string; severity: 'info' | 'warning' | 'error'; message?: string; claimIndex?: number; evidenceSentence?: string }> = [];
  const seenEvidenceSentences = new Set<string>();
  const rejectionCounts = new Map<string, number>();
  const reject = (reason: string, claimIndex?: number, evidenceSentence?: string): null => { rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1); diagnostics.push({ code: `claim_rejected:${reason}`, severity: 'warning', claimIndex, evidenceSentence }); return null; };
  const claims = claimsSource.filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object')).map((claim, claimIndex) => {
    const isLite1 = schemaVersion === 'claims-v2-lite.1';
    const isLite2 = schemaVersion === 'claims-v2-lite.2';
    const exactEvidenceSentence = requiredString(isLite1 || isLite2 ? claim.evidenceSentence : claim.exactEvidenceSentence, '');
    const claimContextText = [context.title, context.sectionTitle, context.sourceCitation, sourceText.slice(0, 500)].filter(Boolean).join('\n');
    const cancerSupport = evidenceCancerSupport(exactEvidenceSentence, claimContextText);
    if (isBadEvidenceSentence(exactEvidenceSentence, claimContextText)) return reject('bad_evidence_sentence', claimIndex, exactEvidenceSentence);
    if (cancerSupport.warning) warnings.push(`claim_flagged:${cancerSupport.warning}`);
    if (isNonResultClaimSentence(exactEvidenceSentence, claim)) return reject('non_result_sentence', claimIndex, exactEvidenceSentence);
    if (isLowValueClaimSentence(exactEvidenceSentence, claim)) return reject('low_value_sentence', claimIndex, exactEvidenceSentence);
    if (!exactEvidenceSentence || (sourceText && !sourceText.includes(exactEvidenceSentence))) return reject('evidence_not_in_source', claimIndex, exactEvidenceSentence);
    const evidenceKey = exactEvidenceSentence.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seenEvidenceSentences.has(evidenceKey)) return reject('duplicate_evidence_sentence', claimIndex, exactEvidenceSentence);
    seenEvidenceSentences.add(evidenceKey);
    const lite2KindMap: Record<string, string> = { treatment: 'treatment_response', prognosis: 'prognosis', biomarker: 'biology', toxicity: 'toxicity', biology: 'biology', resistance: 'resistance', local_control: 'local_control', risk: 'risk', diagnosis: 'diagnosis', other: 'unclear' };
    const lite2LevelMap: Record<string, string> = { human: 'clinical', animal: 'preclinical', cell: 'preclinical', computational: 'computational', review: 'review', unclear: 'unclear' };
    const lite2Direction = /\b(worse|poor|increased|higher|longer|improved|reversed|promoted|enhanced)\b/i.test(String(claim.effectText ?? '')) ? 'increased' : /\b(reduced|decreased|inhibited|lower|shorter|suppressed)\b/i.test(String(claim.effectText ?? '')) ? 'decreased' : 'associated';
    const claimTypeRaw = isLite2 ? lite2KindMap[String(claim.claimKind)] ?? 'unclear' : isLite1 ? ({ biomarker_association: 'biology', other: 'unclear' } as Record<string, string>)[String(claim.claimLabel)] ?? claim.claimLabel : claim.claimType;
    const evidenceOriginRaw = isLite2 ? 'this_study_result' : isLite1 ? ({ prior_work: 'cited_prior_work', method_or_design: 'methods_only', hypothesis: 'hypothesis_or_speculation' } as Record<string, string>)[String(claim.evidenceRole)] ?? claim.evidenceRole : claim.evidenceOrigin;
    const evidenceTypeRaw = isLite2 ? lite2LevelMap[String(claim.evidenceLevel)] ?? 'unclear' : isLite1 ? ({ epidemiology: 'clinical' } as Record<string, string>)[String(claim.evidenceModality)] ?? claim.evidenceModality : claim.evidenceType;
    const directionRaw = isLite2 ? lite2Direction : isLite1 ? claim.effect : claim.direction;
    const polarityRaw = isLite2 ? 'affirmed' : isLite1 ? (claim.negated === true ? 'negated' : claim.speculative === true ? 'speculative' : 'affirmed') : claim.polarity;
    const studyContextFallback = isLite2 ? ({ human: 'human_cohort', animal: 'animal', cell: 'cell_line', computational: 'unclear', review: 'unclear', unclear: 'unclear' } as Record<string, string>)[String(claim.evidenceLevel)] ?? 'unclear' : isLite1 ? (String(claim.evidenceModality) === 'clinical' || String(claim.evidenceModality) === 'epidemiology' ? 'human_cohort' : String(claim.evidenceModality) === 'preclinical' ? 'unclear' : 'unclear') : claim.studyContext;
    const studyContextRaw = inferStudyContext(claim, exactEvidenceSentence, studyContextFallback);
    const claimType = strictEnum(inferClaimType(claim, exactEvidenceSentence, claimTypeRaw), CLAIM_TYPES);
    const evidenceOrigin = strictEnum(inferEvidenceOrigin(exactEvidenceSentence, context, evidenceOriginRaw), EVIDENCE_ORIGINS);
    const evidenceType = strictEnum(inferEvidenceType(exactEvidenceSentence, context, evidenceTypeRaw), EVIDENCE_TYPES);
    const studyContext = strictEnum(studyContextRaw, STUDY_CONTEXTS);
    const polarity = strictEnum(polarityRaw, POLARITIES);
    const direction = strictEnum(directionRaw, DIRECTIONS);
    const confidenceValue = strictConfidence(claim.confidence);
    if (!claimType || !evidenceOrigin || !evidenceType || !studyContext || !polarity || !direction || confidenceValue === undefined) return reject('invalid_required_field', claimIndex, exactEvidenceSentence);
    if (confidenceValue < 0.35) return reject('low_confidence', claimIndex, exactEvidenceSentence);
    const charStart = sourceText ? sourceText.indexOf(exactEvidenceSentence) : -1;
    const charEnd = charStart >= 0 ? charStart + exactEvidenceSentence.length : undefined;
    const normalized: ExtractedClaim = {
      claimType,
      evidenceOrigin,
      evidenceType,
      studyContext,
      polarity,
      direction,
      cancerType: optionalString(isLite1 || isLite2 ? claim.cancer : claim.cancerType) ?? inferCancerTypeFromText([exactEvidenceSentence, context.title, context.sectionTitle, context.sourceCitation, sourceText.slice(0, 500)].filter(Boolean).join(' \n')),
      biomarkerMention: optionalString(isLite2 && String(claim.claimKind) === 'biomarker' ? claim.subject : isLite1 ? claim.biomarker : claim.biomarkerMention),
      drugOrInterventionMention: optionalString(isLite2 ? claim.interventionOrExposure : isLite1 ? claim.intervention : claim.drugOrInterventionMention),
      variantMention: optionalString(isLite1 ? claim.variant : claim.variantMention),
      speciesOrModelMention: optionalString(isLite2 ? claim.evidenceLevel : isLite1 ? claim.populationOrModel : claim.speciesOrModelMention),
      outcomeMention: optionalString(isLite2 ? claim.outcome : isLite1 ? claim.outcome : claim.outcomeMention),
      statisticalEvidenceMention: optionalString(isLite2 ? claim.effectText : isLite1 ? claim.quantitativeSupport : claim.statisticalEvidenceMention),
      sampleSizeMention: optionalString(claim.sampleSizeMention),
      sectionTitle: context.sectionTitle,
      sectionType: context.sectionType as ExtractedClaim['sectionType'],
      paragraphIndex: context.paragraphIndex,
      charStart: charStart >= 0 ? charStart : undefined,
      charEnd,
      exactEvidenceSentence,
      confidence: confidenceValue
    };
    const suggestedPriority = optionalEnum(claim.reviewPriority, REVIEW_PRIORITIES, reviewPriorityForClaim(normalized));
    normalized.reviewPriority = normalized.evidenceOrigin === 'this_study_result' ? suggestedPriority : 'low';
    return normalized;
  }).filter((claim): claim is ExtractedClaim => Boolean(claim));
  const cappedClaims = claims.slice(0, 3);
  for (const [reason, count] of rejectionCounts) warnings.push(`claim_rejected:${reason}:${count}`);
  if (claimsSourceRaw.length > 3 || claims.length > 3) warnings.push('local_model_returned_too_many_claims_truncated_to_3');
  if (!cappedClaims.length) warnings.push('local_model_returned_no_claims');
  const noClaimReason = cappedClaims.length ? undefined : optionalEnum(source.noClaimReason, NO_CLAIM_REASONS, 'extraction_uncertain');
  return resultPayloadV2Schema.parse({ schemaVersion: 'claims-v2', claims: cappedClaims, noClaimReason, summary: cappedClaims.length ? `Extracted ${cappedClaims.length} candidate evidence record${cappedClaims.length === 1 ? '' : 's'} from local model output.` : 'No candidate evidence extracted from local model output.', warnings, diagnostics });
}

export function localLlmV2PromptHash(): string {
  return hashText(extractionPromptV2('{{sourceText}}'));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function verifyLocalLlmAvailable(config: LocalLlmConfig): Promise<void> {
  assertApprovedModel(config.model);
  const response = await fetchWithTimeout(`${config.endpoint}/api/tags`, { method: 'GET' }, Math.min(config.timeoutMs, 10_000));
  if (!response.ok) throw new Error(`local_llm_unavailable:${response.status}`);
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

export async function runLocalLlmV2Extractor(sourceText: string, config: LocalLlmConfig, signal?: AbortSignal, onProgress?: (progress: LocalLlmProgress) => void, context: PacketContext = {}): Promise<ResultPayloadV2> {
  const contextText = [context.title, context.sectionTitle, context.sourceCitation, context.sourceUrl, context.sourcePublishedAt].filter(Boolean).join('\n');
  const candidateSentences = selectCandidateEvidenceSentences(sourceText, 8, contextText);
  const prompt = candidateSentences.length ? candidateSentencePromptV2(candidateSentences, context) : extractionPromptV2([contextText, sourceText].filter(Boolean).join('\n\n'));
  const normalized = normalizeLocalLlmV2Payload(await generateWithPrompt(sourceText, prompt, config, signal, onProgress), sourceText, context);
  normalized.warnings.push(candidateSentences.length ? `candidate_sentence_mode:${candidateSentences.length}` : 'candidate_sentence_mode:none_fallback_full_packet');
  return resultPayloadV2Schema.parse(normalized);
}

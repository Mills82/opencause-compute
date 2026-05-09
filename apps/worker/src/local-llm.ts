import { DEFAULT_LOCAL_MODEL, assertApprovedModel, hashText, resultPayloadSchema, type ResultPayload } from '@opencause/shared';

const ALLOWED_RELATIONSHIPS = new Set([
  'associated_with_response',
  'associated_with_resistance',
  'associated_with_risk',
  'associated_with_progression',
  'studied_with',
  'unclear'
]);

export const LOCAL_LLM_PROMPT_VERSION = 'local-llm-v1-prompt-2026-05-08';

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
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? '45000');

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function defaultQualityTier(options: OllamaGenerationOptions): 'low' | 'balanced' | 'high' | 'ultra' {
  if (options.num_ctx >= 12288 && options.temperature === 0) return 'ultra';
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
      num_ctx: envNumber('LOCAL_LLM_NUM_CTX', 8192),
      num_predict: envNumber('LOCAL_LLM_NUM_PREDICT', 1200)
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

export function extractJsonBlock(raw: string): string {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('local_llm_invalid_json');
  }
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

export function normalizeLocalLlmPayload(rawPayload: unknown, sourceText = ''): ResultPayload {
  const source = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
  const factsSource = Array.isArray(source.facts) ? source.facts : [];
  const facts = factsSource
    .filter((fact): fact is Record<string, unknown> => Boolean(fact && typeof fact === 'object'))
    .map((fact) => {
      const evidenceSentence = requiredString(fact.evidenceSentence, '');
      if (!evidenceSentence || (sourceText && !sourceText.includes(evidenceSentence))) return null;
      const relationship = typeof fact.relationshipType === 'string' && ALLOWED_RELATIONSHIPS.has(fact.relationshipType)
        ? fact.relationshipType
        : 'unclear';
      return {
        cancerType: optionalString(fact.cancerType),
        geneOrBiomarker: optionalString(fact.geneOrBiomarker),
        drugOrCompound: optionalString(fact.drugOrCompound),
        relationshipType: relationship,
        evidenceSentence,
        confidence: confidence(fact.confidence)
      };
    })
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  const warnings = Array.isArray(source.warnings) ? source.warnings.map((warning) => optionalString(warning)).filter((warning): warning is string => Boolean(warning)) : [];
  if (!Array.isArray(source.warnings)) warnings.push('local_model_missing_warnings_array');
  if (!facts.length) warnings.push('local_model_returned_no_facts');
  return resultPayloadSchema.parse({
    facts,
    summary: requiredString(source.summary, facts.length ? `Extracted ${facts.length} candidate fact${facts.length === 1 ? '' : 's'} from local model output.` : 'No candidate facts extracted from local model output.'),
    warnings
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyLocalLlmAvailable(config: LocalLlmConfig): Promise<void> {
  const response = await fetchWithTimeout(`${config.endpoint}/api/tags`, { method: 'GET' }, config.timeoutMs);
  if (!response.ok) {
    throw new Error(`local_llm_unavailable:${response.status}`);
  }
}

export function localLlmPromptHash(): string {
  return hashText(extractionPrompt('{{sourceText}}'));
}

export async function runLocalLlmExtractor(sourceText: string, config: LocalLlmConfig): Promise<ResultPayload> {
  const response = await fetchWithTimeout(
    `${config.endpoint}/api/generate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt: extractionPrompt(sourceText),
        stream: false,
        format: 'json',
        options: config.options
      })
    },
    config.timeoutMs
  );

  if (!response.ok) {
    throw new Error(`local_llm_generate_failed:${response.status}`);
  }

  const json = (await response.json()) as { response?: string };
  const raw = json.response ?? '';
  const payload = JSON.parse(extractJsonBlock(raw));
  return normalizeLocalLlmPayload(payload, sourceText);
}

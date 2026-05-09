import { DEFAULT_LOCAL_MODEL, assertApprovedModel, hashText, resultPayloadSchema, type ResultPayload } from '@opencause/shared';

export const LOCAL_LLM_PROMPT_VERSION = 'local-llm-v1-prompt-2026-05-08';

export type LocalLlmConfig = {
  endpoint: string;
  model: string;
  timeoutMs: number;
};

const DEFAULT_ENDPOINT = process.env.LOCAL_LLM_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.LOCAL_LLM_MODEL ?? DEFAULT_LOCAL_MODEL;
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? '45000');

export function readLocalLlmConfig(): LocalLlmConfig {
  assertApprovedModel(DEFAULT_MODEL, {
    allowLarge: process.env.ALLOW_LARGE_LOCAL_MODEL === 'true',
    allowExperimental: process.env.ALLOW_EXPERIMENTAL_LOCAL_MODEL === 'true'
  });
  return {
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    timeoutMs: Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 45000
  };
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
    '- confidence must be between 0 and 1',
    '- include at least one fact when possible',
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
        format: 'json'
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
  return resultPayloadSchema.parse(payload);
}

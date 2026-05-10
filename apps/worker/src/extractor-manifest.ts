import path from 'node:path';

export type ExtractorManifestEntry = {
  id: 'local-llm-v1' | 'local-llm-v2' | 'mock-extractor-v1';
  mode: 'local-llm' | 'mock';
  approved: boolean;
  allowNetwork: 'localhost-only' | 'none';
  description: string;
};

export const APPROVED_EXTRACTORS: ExtractorManifestEntry[] = [
  {
    id: 'local-llm-v2',
    mode: 'local-llm',
    approved: true,
    allowNetwork: 'localhost-only',
    description: 'Approved Ollama/local LLM claims-v2 extractor for cancer literature packets.'
  },
  {
    id: 'local-llm-v1',
    mode: 'local-llm',
    approved: true,
    allowNetwork: 'localhost-only',
    description: 'Legacy Ollama/local LLM facts-v1 extractor retained for compatibility.'
  },
  {
    id: 'mock-extractor-v1',
    mode: 'mock',
    approved: false,
    allowNetwork: 'none',
    description: 'Test-only mock extractor. Must never run in public volunteer mode.'
  }
];

export function approvedExtractorForMode(mode: 'local-llm' | 'mock'): ExtractorManifestEntry | undefined {
  return APPROVED_EXTRACTORS.find((entry) => entry.mode === mode);
}

export function assertApprovedExtractor(mode: 'local-llm' | 'mock', options: { allowMock: boolean }): ExtractorManifestEntry {
  const entry = approvedExtractorForMode(mode);
  if (!entry) throw new Error(`extractor_not_found:${mode}`);
  if (entry.mode === 'mock' && options.allowMock) return entry;
  if (!entry.approved) throw new Error(`extractor_not_approved:${entry.id}`);
  return entry;
}

export function assertLocalhostEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('local_llm_endpoint_protocol_rejected');
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('local_llm_endpoint_must_be_localhost');
  }
}

export function assertPathInside(baseDir: string, candidatePath: string): void {
  const base = path.resolve(baseDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) {
    throw new Error('path_outside_app_dir');
  }
}

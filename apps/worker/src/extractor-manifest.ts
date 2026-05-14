export type ExtractorManifest = {
  id: 'local-llm-v2';
  label: string;
  description: string;
  localOnly: boolean;
};

const LOCAL_LLM_V2: ExtractorManifest = {
  id: 'local-llm-v2',
  label: 'Local LLM Claims v2',
  description: 'Approved local LLM extractor that emits claims-v2-lite.1 and stores canonical claims-v2 candidate evidence.',
  localOnly: true
};

export function assertApprovedExtractor(mode: string): ExtractorManifest {
  if (mode === 'local-llm') return LOCAL_LLM_V2;
  throw new Error('extractor_not_approved');
}

export function assertLocalhostEndpoint(endpoint: string): void {
  try {
    const url = new URL(endpoint);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('local_llm_endpoint_must_be_localhost');
  } catch (error) {
    if (error instanceof Error && error.message === 'local_llm_endpoint_must_be_localhost') throw error;
    throw new Error('invalid_local_llm_endpoint');
  }
}

export function assertPathInside(parent: string, child: string): void {
  const normalizedParent = parent.endsWith('/') ? parent : `${parent}/`;
  if (!child.startsWith(normalizedParent)) throw new Error('unsafe_path_outside_app_dir');
}

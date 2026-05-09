const DEFAULT_TOOL = 'opencause-compute';

export type NcbiRequestOptions = {
  email?: string;
  apiKey?: string;
  tool?: string;
  requestDelayMs?: number;
  maxRetries?: number;
};

export function ncbiDelayMs(options: NcbiRequestOptions): number {
  if (options.requestDelayMs) return options.requestDelayMs;
  return options.apiKey ? 120 : 350;
}

export function appendNcbiParams(params: URLSearchParams, options: NcbiRequestOptions): URLSearchParams {
  params.set('tool', options.tool ?? process.env.NCBI_TOOL ?? DEFAULT_TOOL);
  if (options.email) params.set('email', options.email);
  if (options.apiKey) params.set('api_key', options.apiKey);
  return params;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, fallbackMs: number): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return fallbackMs;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return fallbackMs;
}

export async function fetchNcbi(url: string, options: NcbiRequestOptions = {}): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  let last: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    last = response;

    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === maxRetries) {
      return response;
    }

    const backoffMs = retryAfterMs(response, ncbiDelayMs(options) * Math.pow(2, attempt + 1));
    await sleep(backoffMs);
  }

  return last ?? fetch(url);
}

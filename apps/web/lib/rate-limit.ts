type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const defaultLimits = {
  publicApi: { limit: envInt('RATE_LIMIT_PUBLIC_API_PER_MINUTE', 120), windowMs: 60_000 },
  nodeRegister: { limit: envInt('RATE_LIMIT_NODE_REGISTER_PER_MINUTE', 5), windowMs: 60_000 },
  nodeHeartbeat: { limit: envInt('RATE_LIMIT_NODE_HEARTBEAT_PER_MINUTE', 60), windowMs: 60_000 },
  workClaim: { limit: envInt('RATE_LIMIT_WORK_CLAIM_PER_MINUTE', 30), windowMs: 60_000 },
  workSubmit: { limit: envInt('RATE_LIMIT_WORK_SUBMIT_PER_MINUTE', 30), windowMs: 60_000 },
  adminApi: { limit: envInt('RATE_LIMIT_ADMIN_API_PER_MINUTE', 60), windowMs: 60_000 },
  workerControl: { limit: envInt('RATE_LIMIT_WORKER_CONTROL_PER_MINUTE', 30), windowMs: 60_000 },
  ingest: { limit: envInt('RATE_LIMIT_ADMIN_INGEST_PER_MINUTE', 10), windowMs: 60_000 }
} as const;

export function rateLimitDefaults() {
  return defaultLimits;
}

export function checkRateLimit(
  request: Request,
  scope: string,
  options: { limit: number; windowMs: number; identity?: string }
): RateLimitResult {
  const now = Date.now();
  const key = `${scope}:${options.identity ?? clientIp(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true };
  }

  if (current.count >= options.limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }

  current.count += 1;
  return { allowed: true };
}

export function checkNamedRateLimit(
  request: Request,
  scope: keyof typeof defaultLimits,
  identity?: string
): RateLimitResult {
  return checkRateLimit(request, scope, { ...defaultLimits[scope], identity });
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } }
  );
}

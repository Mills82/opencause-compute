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

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } }
  );
}

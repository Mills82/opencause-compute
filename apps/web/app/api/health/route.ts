export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  return NextResponse.json({ ok: true, app: 'opencause-compute' });
}

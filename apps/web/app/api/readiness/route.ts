export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadDb } from '../../../lib/db';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';
import { publicLaunchReadiness } from '../../../lib/readiness/public-launch';

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const db = await loadDb();
  return NextResponse.json(publicLaunchReadiness(db));
}

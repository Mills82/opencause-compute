import { NextResponse } from 'next/server';
import { triggerRunNow } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { isAdminAuthorized } from '../../../../lib/admin-auth';

import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';
import { triggerRunNowRelational } from '../../../../lib/relational-app';
export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'workerControl');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const config = (await triggerRunNowRelational()) ?? await withDb((db) => triggerRunNow(db));
  return NextResponse.json({ config });
}

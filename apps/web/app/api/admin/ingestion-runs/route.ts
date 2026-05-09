import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { loadDb } from '../../../../lib/db';

import { checkNamedRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
export async function GET(request: Request) {
  const rateLimit = checkNamedRateLimit(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = await loadDb();
  return NextResponse.json({ ingestionRuns: db.ingestionRuns.slice(0, 50) });
}

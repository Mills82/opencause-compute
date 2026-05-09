import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { abuseMonitoringSnapshot } from '../../../../lib/abuse-monitoring';
import { loadDb } from '../../../../lib/db';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = await loadDb();
  return NextResponse.json({ abuseMonitoring: abuseMonitoringSnapshot(db) });
}

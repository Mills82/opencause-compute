import { NextResponse } from 'next/server';
import { withDb } from '../../../../lib/db';
import { seedDemoData } from '../../../../lib/coordinator';
import { isAdminAuthorized } from '../../../../lib/admin-auth';

import { checkNamedRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
export async function POST(request: Request) {
  const rateLimit = checkNamedRateLimit(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const seeded = await withDb((db) => seedDemoData(db));
  return NextResponse.json({ seeded });
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withDb } from '../../../lib/db';
import { listWorkPackets } from '../../../lib/coordinator';
import { isAdminAuthorized } from '../../../lib/admin-auth';

import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';
export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const workPackets = await withDb((db) => listWorkPackets(db));
  return NextResponse.json({ workPackets });
}

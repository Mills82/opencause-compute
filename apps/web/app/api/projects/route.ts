export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withDb } from '../../../lib/db';
import { listProjects } from '../../../lib/coordinator';
import { isAdminAuthorized } from '../../../lib/admin-auth';

import { checkNamedRateLimit, rateLimitResponse } from '../../../lib/rate-limit';
export async function GET(request: Request) {
  const rateLimit = checkNamedRateLimit(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const projects = await withDb((db) => listProjects(db));
  return NextResponse.json({ projects });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';
import { withDb } from '../../../../../lib/db';
import { moderatePublicTarget } from '../../../../../lib/gamification/moderation';
import { moderatePublicTargetRelational } from '../../../../../lib/relational-app';

const schema = z.object({ targetType: z.enum(['volunteer_profile', 'team', 'impact_card']), targetId: z.string().min(1), moderationStatus: z.enum(['ok', 'hidden', 'flagged']), note: z.string().max(1000).optional() });

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json((await moderatePublicTargetRelational(parsed.data)) ?? await withDb((db) => moderatePublicTarget(db, parsed.data)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'moderation_failed' }, { status: 400 });
  }
}

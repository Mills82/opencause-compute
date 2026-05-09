import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { withDb } from '../../../../../lib/db';
import { moderatePublicTarget } from '../../../../../lib/gamification/moderation';

const schema = z.object({ targetType: z.enum(['volunteer_profile', 'team', 'impact_card']), targetId: z.string().min(1), moderationStatus: z.enum(['ok', 'hidden', 'flagged']), note: z.string().max(1000).optional() });

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await withDb((db) => moderatePublicTarget(db, parsed.data)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'moderation_failed' }, { status: 400 });
  }
}

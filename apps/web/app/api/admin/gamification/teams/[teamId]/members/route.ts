import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../../../lib/admin-auth';
import { withDb } from '../../../../../../../lib/db';
import { setTeamMembershipAdmin } from '../../../../../../../lib/gamification/admin';

const schema = z.object({
  volunteerProfileId: z.string().min(1),
  role: z.enum(['member', 'captain']).optional(),
  status: z.enum(['active', 'left', 'removed']).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { teamId } = await params;
  try {
    const membership = await withDb((db) => setTeamMembershipAdmin(db, { teamId, ...parsed.data }));
    return NextResponse.json({ membership });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'membership_update_failed' }, { status: 400 });
  }
}

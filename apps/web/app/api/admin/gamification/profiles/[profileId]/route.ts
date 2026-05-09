import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../../lib/admin-auth';
import { withDb } from '../../../../../../lib/db';
import { updateVolunteerProfileAdmin } from '../../../../../../lib/gamification/admin';

const schema = z.object({
  displayName: z.string().optional(),
  privacyMode: z.enum(['private', 'public_anonymous', 'public_named']).optional(),
  publicProfileEnabled: z.boolean().optional(),
  bio: z.string().optional(),
  avatarColor: z.string().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { profileId } = await params;
  try {
    const profile = await withDb((db) => updateVolunteerProfileAdmin(db, { profileId, ...parsed.data }));
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'update_failed' }, { status: 400 });
  }
}

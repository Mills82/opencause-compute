import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { withDb } from '../../../../../lib/db';
import { createTeamAdmin } from '../../../../../lib/gamification/admin';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  createdByVolunteerProfileId: z.string().optional()
});

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const team = await withDb((db) => createTeamAdmin(db, parsed.data));
    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'team_create_failed' }, { status: 400 });
  }
}

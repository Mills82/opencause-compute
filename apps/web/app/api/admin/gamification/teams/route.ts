import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';
import { withDb } from '../../../../../lib/db';
import { createTeamAdmin } from '../../../../../lib/gamification/admin';
import { createTeamAdminRelational } from '../../../../../lib/relational-app';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  createdByVolunteerProfileId: z.string().optional()
});

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const team = (await createTeamAdminRelational(parsed.data)) ?? await withDb((db) => createTeamAdmin(db, parsed.data));
    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'team_create_failed' }, { status: 400 });
  }
}

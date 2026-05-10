import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDb, withDb } from '../../../../lib/db';
import { readProfileSetup, updateProfileSetup } from '../../../../lib/gamification/profile-setup';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';
import { readProfileSetupRelational, updateProfileSetupRelational } from '../../../../lib/relational-app';

const updateSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(80).optional(),
  privacyMode: z.enum(['private', 'public_anonymous', 'public_named']).optional(),
  publicProfileEnabled: z.boolean().optional(),
  bio: z.string().max(240).optional(),
  avatarColor: z.string().max(32).optional(),
  teamId: z.string().nullable().optional()
});

export async function GET(request: Request) {
  const limit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  try {
    const relationalSetup = await readProfileSetupRelational(token);
    return NextResponse.json(relationalSetup ?? readProfileSetup(await loadDb(), token));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'profile_setup_failed' }, { status: 404 });
  }
}

export async function PATCH(request: Request) {
  const limit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const profile = (await updateProfileSetupRelational(parsed.data)) ?? await withDb((db) => updateProfileSetup(db, parsed.data));
    return NextResponse.json({ profile: { displayName: profile.displayName, slug: profile.slug, privacyMode: profile.privacyMode, publicProfileEnabled: profile.publicProfileEnabled, bio: profile.bio ?? '', avatarColor: profile.avatarColor } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'profile_update_failed' }, { status: 400 });
  }
}

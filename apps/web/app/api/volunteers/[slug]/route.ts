import { NextResponse } from 'next/server';
import { loadDb } from '../../../../lib/db';
import { canShowVolunteerProfile, latestVolunteerStats } from '../../../../lib/gamification/public';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const profile = db.volunteerProfiles.find((candidate) => candidate.slug === slug);
  if (!profile || !canShowVolunteerProfile(profile)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const stats = latestVolunteerStats(db, profile.id);
  return NextResponse.json({
    displayName: profile.displayName,
    slug: profile.slug,
    avatarColor: profile.avatarColor,
    bio: profile.bio ?? '',
    joinedAt: profile.joinedAt,
    stats: stats ?? null,
    badges: db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id).map((badge) => ({ slug: badge.badgeSlug, awardedAt: badge.awardedAt }))
  });
}

import { randomUUID } from 'node:crypto';
import type { DatabaseState, VolunteerProfile } from '@opencause/shared';

const AVATAR_COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#fb7185', '#2dd4bf'];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'volunteer';
}

function uniqueSlug(db: DatabaseState, base: string): string {
  let slug = slugify(base);
  let suffix = 2;
  while (db.volunteerProfiles.some((profile) => profile.slug === slug)) {
    slug = `${slugify(base)}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function createPrivateVolunteerProfileForNode(db: DatabaseState, nodeId: string, nowIso = new Date().toISOString()): VolunteerProfile {
  db.volunteerProfiles ??= [];
  db.volunteerProfileNodes ??= [];
  const existingLink = db.volunteerProfileNodes.find((link) => link.nodeId === nodeId && !link.detachedAt);
  const existing = existingLink ? db.volunteerProfiles.find((profile) => profile.id === existingLink.volunteerProfileId) : undefined;
  if (existing) return existing;

  const number = db.volunteerProfiles.length + 1;
  const displayName = `Volunteer ${String(number).padStart(4, '0')}`;
  const profile: VolunteerProfile = {
    id: randomUUID(),
    displayName,
    slug: uniqueSlug(db, displayName),
    privacyMode: 'private',
    publicProfileEnabled: false,
    moderationStatus: 'ok',
    moderationNote: undefined,
    avatarColor: AVATAR_COLORS[(number - 1) % AVATAR_COLORS.length],
    joinedAt: nowIso,
    lastActiveAt: nowIso,
    statsUpdatedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  db.volunteerProfiles.push(profile);
  db.volunteerProfileNodes.push({
    id: randomUUID(),
    volunteerProfileId: profile.id,
    nodeId,
    attachedAt: nowIso,
    detachedAt: null
  });
  return profile;
}

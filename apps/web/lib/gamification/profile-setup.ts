import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseState, PrivacyMode, VolunteerProfile } from '@opencause/shared';
import { updateVolunteerProfileAdmin } from './admin';

const TOKEN_PREFIX = 'ocp_';
const TOKEN_TTL_DAYS = 30;

export function hashProfileSetupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueProfileSetupToken(profile: VolunteerProfile, now = new Date()): string {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
  profile.setupTokenHash = hashProfileSetupToken(token);
  profile.setupTokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 86_400_000).toISOString();
  profile.updatedAt = now.toISOString();
  return token;
}

export function findProfileBySetupToken(db: DatabaseState, token: string, now = new Date()): VolunteerProfile | undefined {
  const hash = hashProfileSetupToken(token);
  return db.volunteerProfiles.find((profile) => profile.setupTokenHash === hash && (!profile.setupTokenExpiresAt || new Date(profile.setupTokenExpiresAt).getTime() > now.getTime()));
}

export function readProfileSetup(db: DatabaseState, token: string, now = new Date()) {
  const profile = findProfileBySetupToken(db, token, now);
  if (!profile) throw new Error('invalid_or_expired_profile_setup_token');
  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      slug: profile.slug,
      privacyMode: profile.privacyMode,
      publicProfileEnabled: profile.publicProfileEnabled,
      avatarColor: profile.avatarColor,
      bio: profile.bio ?? ''
    },
    stats: db.volunteerStatsSnapshots.find((stats) => stats.volunteerProfileId === profile.id && stats.window === 'all_time') ?? null,
    latestDigest: db.impactDigests.filter((digest) => digest.volunteerProfileId === profile.id).sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0] ?? null,
    badges: db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id).map((badge) => ({ slug: badge.badgeSlug, awardedAt: badge.awardedAt })),
    teams: db.teams.filter((team) => team.visibility === 'public').map((team) => ({ id: team.id, name: team.name, slug: team.slug, description: team.description }))
  };
}

export function updateProfileSetup(db: DatabaseState, input: {
  token: string;
  displayName?: string;
  privacyMode?: PrivacyMode;
  publicProfileEnabled?: boolean;
  bio?: string;
  avatarColor?: string;
  teamId?: string | null;
}) {
  const profile = findProfileBySetupToken(db, input.token);
  if (!profile) throw new Error('invalid_or_expired_profile_setup_token');
  const updated = updateVolunteerProfileAdmin(db, { profileId: profile.id, displayName: input.displayName, privacyMode: input.privacyMode, publicProfileEnabled: input.publicProfileEnabled, bio: input.bio, avatarColor: input.avatarColor });
  if (input.teamId !== undefined) {
    for (const membership of db.teamMemberships.filter((candidate) => candidate.volunteerProfileId === profile.id && candidate.status === 'active')) {
      membership.status = 'left';
      membership.leftAt = new Date().toISOString();
    }
    if (input.teamId) {
      const team = db.teams.find((candidate) => candidate.id === input.teamId && candidate.visibility === 'public');
      if (!team) throw new Error('team_not_found');
      db.teamMemberships.push({ id: randomUUID(), teamId: team.id, volunteerProfileId: profile.id, role: 'member', status: 'active', joinedAt: new Date().toISOString(), leftAt: null });
    }
  }
  return updated;
}

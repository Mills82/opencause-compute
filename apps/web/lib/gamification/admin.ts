import { randomUUID } from 'node:crypto';
import type { DatabaseState, PrivacyMode, Team, TeamMembership, VolunteerProfile } from '@opencause/shared';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'team';
}

function uniqueSlug(existing: string[], base: string): string {
  const root = slugify(base);
  let slug = root;
  let suffix = 2;
  while (existing.includes(slug)) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function listGamificationAdmin(db: DatabaseState) {
  return {
    profiles: db.volunteerProfiles.map((profile) => ({
      ...profile,
      nodes: db.volunteerProfileNodes.filter((link) => link.volunteerProfileId === profile.id && !link.detachedAt).map((link) => link.nodeId),
      stats: db.volunteerStatsSnapshots.find((stats) => stats.volunteerProfileId === profile.id && stats.window === 'all_time') ?? null,
      badges: db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id)
    })),
    teams: db.teams.map((team) => ({
      ...team,
      memberships: db.teamMemberships.filter((membership) => membership.teamId === team.id),
      stats: db.teamStatsSnapshots.find((stats) => stats.teamId === team.id && stats.window === 'all_time') ?? null
    })),
    badgeDefinitions: db.badgeDefinitions
  };
}

export function updateVolunteerProfileAdmin(db: DatabaseState, input: {
  profileId: string;
  displayName?: string;
  privacyMode?: PrivacyMode;
  publicProfileEnabled?: boolean;
  bio?: string;
  avatarColor?: string;
}): VolunteerProfile {
  const profile = db.volunteerProfiles.find((candidate) => candidate.id === input.profileId);
  if (!profile) throw new Error('volunteer_profile_not_found');
  if (input.displayName !== undefined) profile.displayName = input.displayName.trim().slice(0, 80) || profile.displayName;
  if (input.privacyMode !== undefined) profile.privacyMode = input.privacyMode;
  if (input.publicProfileEnabled !== undefined) profile.publicProfileEnabled = input.publicProfileEnabled;
  if (input.bio !== undefined) profile.bio = input.bio.trim().slice(0, 240);
  if (input.avatarColor !== undefined) profile.avatarColor = input.avatarColor.trim().slice(0, 32) || profile.avatarColor;
  if (profile.privacyMode === 'private') profile.publicProfileEnabled = false;
  profile.updatedAt = new Date().toISOString();
  return profile;
}

export function createTeamAdmin(db: DatabaseState, input: {
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
  createdByVolunteerProfileId?: string;
}): Team {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error('team_name_required');
  if (input.createdByVolunteerProfileId && !db.volunteerProfiles.some((profile) => profile.id === input.createdByVolunteerProfileId)) {
    throw new Error('volunteer_profile_not_found');
  }
  const now = new Date().toISOString();
  const team: Team = {
    id: randomUUID(),
    name,
    slug: uniqueSlug(db.teams.map((candidate) => candidate.slug), name),
    description: input.description?.trim().slice(0, 500) ?? '',
    visibility: input.visibility ?? 'public',
    moderationStatus: 'ok',
    moderationNote: undefined,
    createdByVolunteerProfileId: input.createdByVolunteerProfileId,
    createdAt: now,
    updatedAt: now,
    statsUpdatedAt: null
  };
  db.teams.push(team);
  if (input.createdByVolunteerProfileId) {
    db.teamMemberships.push({ id: randomUUID(), teamId: team.id, volunteerProfileId: input.createdByVolunteerProfileId, role: 'captain', status: 'active', joinedAt: now, leftAt: null });
  }
  return team;
}

export function setTeamMembershipAdmin(db: DatabaseState, input: {
  teamId: string;
  volunteerProfileId: string;
  role?: 'member' | 'captain';
  status?: 'active' | 'left' | 'removed';
}): TeamMembership {
  if (!db.teams.some((team) => team.id === input.teamId)) throw new Error('team_not_found');
  if (!db.volunteerProfiles.some((profile) => profile.id === input.volunteerProfileId)) throw new Error('volunteer_profile_not_found');
  const now = new Date().toISOString();
  let membership = db.teamMemberships.find((candidate) => candidate.teamId === input.teamId && candidate.volunteerProfileId === input.volunteerProfileId);
  if (!membership) {
    membership = { id: randomUUID(), teamId: input.teamId, volunteerProfileId: input.volunteerProfileId, role: input.role ?? 'member', status: input.status ?? 'active', joinedAt: now, leftAt: null };
    db.teamMemberships.push(membership);
    return membership;
  }
  if (input.role) membership.role = input.role;
  if (input.status) {
    membership.status = input.status;
    membership.leftAt = input.status === 'active' ? null : now;
  }
  return membership;
}

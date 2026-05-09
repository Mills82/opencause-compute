import type { DatabaseState, VolunteerProfile, VolunteerStatsSnapshot } from '@opencause/shared';

export function latestVolunteerStats(db: DatabaseState, profileId: string): VolunteerStatsSnapshot | undefined {
  return db.volunteerStatsSnapshots.find((stats) => stats.volunteerProfileId === profileId && stats.window === 'all_time');
}

export function publicVolunteerName(profile: VolunteerProfile): string {
  return profile.privacyMode === 'public_named' ? profile.displayName : 'Anonymous Volunteer';
}

export function canShowVolunteerProfile(profile: VolunteerProfile): boolean {
  return profile.publicProfileEnabled && profile.privacyMode === 'public_named' && profile.moderationStatus !== 'hidden';
}

export function buildImpactSummary(db: DatabaseState) {
  const stats = db.volunteerStatsSnapshots.filter((snapshot) => snapshot.window === 'all_time');
  const sum = (key: keyof VolunteerStatsSnapshot) => stats.reduce((total, snapshot) => total + Number(snapshot[key] ?? 0), 0);
  return {
    volunteers: db.volunteerProfiles.length,
    publicVolunteers: db.volunteerProfiles.filter((profile) => profile.publicProfileEnabled && profile.privacyMode !== 'private' && profile.moderationStatus !== 'hidden').length,
    activeVolunteers: stats.filter((snapshot) => snapshot.packetsSubmitted > 0).length,
    activeNodes: db.nodes.filter((node) => node.status === 'online').length,
    teams: db.teams.filter((team) => team.visibility === 'public' && team.moderationStatus !== 'hidden').length,
    sectionsProcessed: sum('sectionsProcessed'),
    formatValidatedSubmissions: sum('formatValidatedSubmissions'),
    consensusPassedContributions: sum('consensusPassedContributions'),
    humanReviewedAcceptedContributions: sum('humanReviewedAcceptedContributions'),
    contributionScore: sum('contributionScore'),
    currentProject: 'Cancer Knowledge Miner',
    disclaimer: 'These metrics describe candidate extraction and validation work. They are not medical conclusions or clinical findings.'
  };
}

export function buildVolunteerLeaderboard(db: DatabaseState) {
  return db.volunteerProfiles
    .filter((profile) => profile.publicProfileEnabled && profile.privacyMode !== 'private' && profile.moderationStatus !== 'hidden')
    .map((profile) => {
      const stats = latestVolunteerStats(db, profile.id);
      const membership = db.teamMemberships.find((candidate) => candidate.volunteerProfileId === profile.id && candidate.status === 'active');
      const team = membership ? db.teams.find((candidate) => candidate.id === membership.teamId && candidate.visibility === 'public') : undefined;
      return {
        slug: profile.privacyMode === 'public_named' ? profile.slug : null,
        displayName: publicVolunteerName(profile),
        team: team ? { name: team.name, slug: team.slug } : null,
        contributionScore: stats?.contributionScore ?? 0,
        consensusPassedContributions: stats?.consensusPassedContributions ?? 0,
        formatValidatedSubmissions: stats?.formatValidatedSubmissions ?? 0,
        activeDays: stats?.distinctActiveDays ?? 0,
        badges: db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id).slice(0, 6).map((badge) => badge.badgeSlug)
      };
    })
    .sort((a, b) => b.contributionScore - a.contributionScore)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

export function buildTeamLeaderboard(db: DatabaseState) {
  return db.teams
    .filter((team) => team.visibility === 'public' && team.moderationStatus !== 'hidden')
    .map((team) => {
      const stats = db.teamStatsSnapshots.find((snapshot) => snapshot.teamId === team.id && snapshot.window === 'all_time');
      return {
        slug: team.slug,
        name: team.name,
        memberCount: stats?.memberCount ?? db.teamMemberships.filter((membership) => membership.teamId === team.id && membership.status === 'active').length,
        activeMemberCount: stats?.activeMemberCount ?? 0,
        contributionScore: stats?.contributionScore ?? 0,
        consensusPassedContributions: stats?.consensusPassedContributions ?? 0,
        formatValidatedSubmissions: stats?.formatValidatedSubmissions ?? 0,
        activeDays: stats?.distinctActiveDays ?? 0
      };
    })
    .sort((a, b) => b.contributionScore - a.contributionScore)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

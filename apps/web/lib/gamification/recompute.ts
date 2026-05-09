import { randomUUID } from 'node:crypto';
import { BADGE_DEFINITIONS, calculateContributionScore, type DatabaseState, type ImpactCard, type ImpactDigest, type VolunteerStatsSnapshot, type TeamStatsSnapshot } from '@opencause/shared';

function activeProfileIdForNode(db: DatabaseState, nodeId: string): string | undefined {
  return db.volunteerProfileNodes.find((link) => link.nodeId === nodeId && !link.detachedAt)?.volunteerProfileId;
}

function distinctDays(dates: string[]): string[] {
  return [...new Set(dates.map((date) => date.slice(0, 10)))].sort();
}

function currentStreak(days: string[], now = new Date()): number {
  const set = new Set(days);
  let count = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (set.has(cursor.toISOString().slice(0, 10))) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

function longestStreak(days: string[]): number {
  let longest = 0;
  let current = 0;
  let prev = 0;
  for (const day of days) {
    const value = Date.parse(`${day}T00:00:00.000Z`) / 86_400_000;
    current = value === prev + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    prev = value;
  }
  return longest;
}

function valueForCriteria(stats: VolunteerStatsSnapshot, kind: string, extra: { lowErrorSubmissions: number; projectsContributedTo: number; teamMemberships: number; teamCaptainMemberships: number }): number {
  if (kind in stats) return Number(stats[kind as keyof VolunteerStatsSnapshot] ?? 0);
  return Number(extra[kind as keyof typeof extra] ?? 0);
}

function startOfWeek(now: Date): Date {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
}

function digestPreview(input: Pick<ImpactDigest, 'sectionsProcessed' | 'formatValidatedSubmissions' | 'consensusPassedContributions' | 'idleMinutesDonated' | 'badgesAwarded'>): string {
  if (!input.sectionsProcessed && !input.formatValidatedSubmissions && !input.consensusPassedContributions && !input.badgesAwarded) {
    return 'Your impact digest will appear after your worker completes eligible contributions.';
  }
  const parts = [`This week your idle computer helped process ${input.sectionsProcessed.toLocaleString()} open-access paper section${input.sectionsProcessed === 1 ? '' : 's'}`];
  parts.push(`${input.formatValidatedSubmissions.toLocaleString()} submission${input.formatValidatedSubmissions === 1 ? '' : 's'} passed format validation`);
  parts.push(`${input.consensusPassedContributions.toLocaleString()} contributed to consensus-passed candidate fact${input.consensusPassedContributions === 1 ? '' : 's'}`);
  if (input.badgesAwarded) parts.push(`you earned ${input.badgesAwarded.toLocaleString()} badge${input.badgesAwarded === 1 ? '' : 's'}`);
  return `${parts.join(', ')}.`;
}

function cardSlug(kind: string, id: string, weekStart: Date): string {
  return `${kind}-${id.slice(0, 8)}-${weekStart.toISOString().slice(0, 10)}`;
}

function upsertImpactCard(db: DatabaseState, card: ImpactCard): void {
  const index = db.impactCards.findIndex((existing) => existing.slug === card.slug);
  if (index >= 0) db.impactCards[index] = card;
  else db.impactCards.push(card);
}

export function seedBadgeDefinitions(db: DatabaseState, nowIso = new Date().toISOString()): number {
  let added = 0;
  for (const definition of BADGE_DEFINITIONS) {
    if (db.badgeDefinitions.some((existing) => existing.slug === definition.slug)) continue;
    db.badgeDefinitions.push({ id: randomUUID(), ...definition, createdAt: nowIso });
    added += 1;
  }
  return added;
}

export function recomputeGamification(db: DatabaseState, now = new Date()): { profilesUpdated: number; teamsUpdated: number; badgesAwarded: number; badgeDefinitionsSeeded: number } {
  const nowIso = now.toISOString();
  const badgeDefinitionsSeeded = seedBadgeDefinitions(db, nowIso);
  const eligibleNodeIds = new Set(db.nodes.filter((node) => node.status !== 'suspended' && node.status !== 'revoked').map((node) => node.id));
  const submittedByProfile = new Map<string, typeof db.results>();

  for (const result of db.results) {
    if (!eligibleNodeIds.has(result.nodeId)) continue;
    const profileId = activeProfileIdForNode(db, result.nodeId);
    if (!profileId) continue;
    const existing = submittedByProfile.get(profileId) ?? [];
    if (existing.some((candidate) => candidate.nodeId === result.nodeId && candidate.workPacketId === result.workPacketId)) continue;
    existing.push(result);
    submittedByProfile.set(profileId, existing);
  }

  db.volunteerStatsSnapshots = db.volunteerStatsSnapshots.filter((snapshot) => snapshot.window !== 'all_time');
  db.teamStatsSnapshots = db.teamStatsSnapshots.filter((snapshot) => snapshot.window !== 'all_time');
  const weekStart = startOfWeek(now);
  const weekEnd = now;
  db.impactDigests = db.impactDigests.filter((digest) => digest.periodStart !== weekStart.toISOString() || digest.periodEnd !== weekEnd.toISOString());
  db.impactCards ??= [];

  let badgesAwarded = 0;
  for (const profile of db.volunteerProfiles) {
    const results = submittedByProfile.get(profile.id) ?? [];
    const dates = distinctDays(results.map((result) => result.submittedAt));
    const formatValidatedSubmissions = results.filter((result) => result.formatValidated ?? result.validated).length;
    const formatRejectedSubmissions = results.filter((result) => !(result.formatValidated ?? result.validated)).length;
    const consensusPassedContributions = results.filter((result) => result.consensusStatus === 'consensus_passed').length;
    const consensusFailedContributions = results.filter((result) => result.consensusStatus === 'consensus_failed').length;
    const humanReviewedAcceptedContributions = results.filter((result) => result.reviewStatus === 'human_reviewed').length;
    const distinctActiveDays = dates.length;
    const idleMinutesDonated = 0;
    const score = calculateContributionScore({ formatValidatedSubmissions, consensusPassedContributions, humanReviewedAcceptedContributions, distinctActiveDays, idleMinutesDonated, formatRejectedSubmissions, consensusFailedContributions });
    const activeMemberships = db.teamMemberships.filter((membership) => membership.volunteerProfileId === profile.id && membership.status === 'active');
    const lowErrorSubmissions = results.length >= 50 && formatRejectedSubmissions / Math.max(1, results.length) <= 0.05 ? results.length : 0;
    const stats: VolunteerStatsSnapshot = {
      id: randomUUID(),
      volunteerProfileId: profile.id,
      window: 'all_time',
      windowStart: null,
      windowEnd: null,
      contributionScore: score.contributionScore,
      sectionsProcessed: results.length,
      packetsSubmitted: results.length,
      formatValidatedSubmissions,
      formatRejectedSubmissions,
      consensusPassedContributions,
      consensusFailedContributions,
      humanReviewedAcceptedContributions,
      idleMinutesDonated,
      distinctActiveDays,
      currentStreakDays: currentStreak(dates, now),
      longestStreakDays: longestStreak(dates),
      badgesCount: db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id).length,
      computedAt: nowIso
    };

    const extra = {
      lowErrorSubmissions,
      projectsContributedTo: new Set(results.map((result) => db.workPackets.find((packet) => packet.id === result.workPacketId)?.projectId).filter(Boolean)).size,
      teamMemberships: activeMemberships.length,
      teamCaptainMemberships: activeMemberships.filter((membership) => membership.role === 'captain').length
    };
    for (const definition of db.badgeDefinitions) {
      if (valueForCriteria(stats, definition.criteriaKind, extra) < definition.criteriaValue) continue;
      if (db.volunteerBadges.some((badge) => badge.volunteerProfileId === profile.id && badge.badgeSlug === definition.slug)) continue;
      db.volunteerBadges.push({ id: randomUUID(), volunteerProfileId: profile.id, badgeSlug: definition.slug, awardedAt: nowIso, sourceKind: 'gamification_recompute', sourceId: stats.id });
      badgesAwarded += 1;
    }
    stats.badgesCount = db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id).length;
    db.volunteerStatsSnapshots.push(stats);
    const weeklyResults = results.filter((result) => new Date(result.submittedAt).getTime() >= weekStart.getTime() && new Date(result.submittedAt).getTime() <= weekEnd.getTime());
    const weeklyBadges = db.volunteerBadges.filter((badge) => badge.volunteerProfileId === profile.id && new Date(badge.awardedAt).getTime() >= weekStart.getTime() && new Date(badge.awardedAt).getTime() <= weekEnd.getTime()).length;
    const digest: ImpactDigest = {
      id: randomUUID(),
      volunteerProfileId: profile.id,
      periodStart: weekStart.toISOString(),
      periodEnd: weekEnd.toISOString(),
      sectionsProcessed: weeklyResults.length,
      formatValidatedSubmissions: weeklyResults.filter((result) => result.formatValidated ?? result.validated).length,
      consensusPassedContributions: weeklyResults.filter((result) => result.consensusStatus === 'consensus_passed').length,
      idleMinutesDonated: 0,
      badgesAwarded: weeklyBadges,
      teamRank: null,
      previewText: '',
      createdAt: nowIso,
      deliveredAt: null
    };
    digest.previewText = digestPreview(digest);
    db.impactDigests.push(digest);
    if (profile.publicProfileEnabled && profile.privacyMode !== 'private') {
      upsertImpactCard(db, {
        id: randomUUID(),
        volunteerProfileId: profile.id,
        teamId: null,
        cardType: 'volunteer_weekly',
        slug: cardSlug('volunteer-weekly', profile.id, weekStart),
        title: profile.privacyMode === 'public_named' ? `${profile.displayName}'s OpenCause impact` : 'Anonymous OpenCause volunteer impact',
        subtitle: digest.previewText,
        metricLabel: 'Paper sections processed this week',
        metricValue: digest.sectionsProcessed.toLocaleString(),
        accentColor: profile.avatarColor,
        publicEnabled: true,
        periodStart: digest.periodStart,
        periodEnd: digest.periodEnd,
        createdAt: nowIso
      });
    }
    profile.lastActiveAt = results.length ? results.map((result) => result.submittedAt).sort().at(-1) ?? profile.lastActiveAt : profile.lastActiveAt;
    profile.statsUpdatedAt = nowIso;
    profile.updatedAt = nowIso;
  }

  for (const team of db.teams) {
    const memberships = db.teamMemberships.filter((membership) => membership.teamId === team.id && membership.status === 'active');
    const memberStats = memberships.map((membership) => db.volunteerStatsSnapshots.find((stats) => stats.volunteerProfileId === membership.volunteerProfileId && stats.window === 'all_time')).filter((stats): stats is VolunteerStatsSnapshot => Boolean(stats));
    const aggregate = (key: keyof VolunteerStatsSnapshot) => memberStats.reduce((sum, stats) => sum + Number(stats[key] ?? 0), 0);
    const stats: TeamStatsSnapshot = {
      id: randomUUID(),
      teamId: team.id,
      window: 'all_time',
      windowStart: null,
      windowEnd: null,
      contributionScore: aggregate('contributionScore'),
      sectionsProcessed: aggregate('sectionsProcessed'),
      packetsSubmitted: aggregate('packetsSubmitted'),
      formatValidatedSubmissions: aggregate('formatValidatedSubmissions'),
      formatRejectedSubmissions: aggregate('formatRejectedSubmissions'),
      consensusPassedContributions: aggregate('consensusPassedContributions'),
      consensusFailedContributions: aggregate('consensusFailedContributions'),
      humanReviewedAcceptedContributions: aggregate('humanReviewedAcceptedContributions'),
      idleMinutesDonated: aggregate('idleMinutesDonated'),
      distinctActiveDays: Math.max(0, ...memberStats.map((stats) => stats.distinctActiveDays)),
      currentStreakDays: Math.max(0, ...memberStats.map((stats) => stats.currentStreakDays)),
      longestStreakDays: Math.max(0, ...memberStats.map((stats) => stats.longestStreakDays)),
      memberCount: memberships.length,
      activeMemberCount: memberStats.filter((stats) => stats.packetsSubmitted > 0).length,
      computedAt: nowIso
    };
    db.teamStatsSnapshots.push(stats);
    if (team.visibility === 'public') {
      upsertImpactCard(db, {
        id: randomUUID(),
        volunteerProfileId: null,
        teamId: team.id,
        cardType: 'team_weekly',
        slug: cardSlug('team-weekly', team.id, weekStart),
        title: `${team.name} OpenCause impact`,
        subtitle: `This team has helped process ${stats.sectionsProcessed.toLocaleString()} open-access paper sections in eligible OpenCause work.`,
        metricLabel: 'Team contribution score',
        metricValue: stats.contributionScore.toLocaleString(),
        accentColor: '#38bdf8',
        publicEnabled: true,
        periodStart: weekStart.toISOString(),
        periodEnd: weekEnd.toISOString(),
        createdAt: nowIso
      });
    }
    team.statsUpdatedAt = nowIso;
    team.updatedAt = nowIso;
  }

  return { profilesUpdated: db.volunteerProfiles.length, teamsUpdated: db.teams.length, badgesAwarded, badgeDefinitionsSeeded };
}

import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { createTeamAdmin, setTeamMembershipAdmin, updateVolunteerProfileAdmin } from './admin';
import { buildVolunteerLeaderboard } from './public';

function db(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [{ id: '00000000-0000-0000-0000-000000000001', displayName: 'Volunteer 0001', slug: 'volunteer-0001', privacyMode: 'private', publicProfileEnabled: false, avatarColor: '#fff', joinedAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null, statsUpdatedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    volunteerProfileNodes: [], teams: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [],
    volunteerStatsSnapshots: [{ id: '00000000-0000-0000-0000-000000000002', volunteerProfileId: '00000000-0000-0000-0000-000000000001', window: 'all_time', windowStart: null, windowEnd: null, contributionScore: 10, sectionsProcessed: 1, packetsSubmitted: 1, formatValidatedSubmissions: 1, formatRejectedSubmissions: 0, consensusPassedContributions: 0, consensusFailedContributions: 0, humanReviewedAcceptedContributions: 0, idleMinutesDonated: 0, distinctActiveDays: 1, currentStreakDays: 1, longestStreakDays: 1, badgesCount: 0, computedAt: '2026-01-01T00:00:00.000Z' }],
    teamStatsSnapshots: [], impactDigests: [], impactCards: [], publicReports: [], workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: '2026-01-01T00:00:00.000Z' }
  };
}

describe('admin gamification controls', () => {
  it('keeps private profile hidden and exposes opt-in named profile', () => {
    const state = db();
    expect(buildVolunteerLeaderboard(state)).toEqual([]);
    updateVolunteerProfileAdmin(state, { profileId: state.volunteerProfiles[0].id, displayName: 'Matt Test', privacyMode: 'public_named', publicProfileEnabled: true });
    expect(buildVolunteerLeaderboard(state)[0].displayName).toBe('Matt Test');
  });

  it('forces public profile disabled when profile is private', () => {
    const state = db();
    updateVolunteerProfileAdmin(state, { profileId: state.volunteerProfiles[0].id, privacyMode: 'private', publicProfileEnabled: true });
    expect(state.volunteerProfiles[0].publicProfileEnabled).toBe(false);
  });

  it('creates teams and active memberships', () => {
    const state = db();
    const team = createTeamAdmin(state, { name: 'Cancer Research Supporters', createdByVolunteerProfileId: state.volunteerProfiles[0].id });
    expect(team.slug).toBe('cancer-research-supporters');
    expect(state.teamMemberships[0].role).toBe('captain');
    const membership = setTeamMembershipAdmin(state, { teamId: team.id, volunteerProfileId: state.volunteerProfiles[0].id, role: 'member', status: 'active' });
    expect(membership.status).toBe('active');
  });
});

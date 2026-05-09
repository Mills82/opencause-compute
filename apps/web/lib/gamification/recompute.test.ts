import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { recomputeGamification } from './recompute';
import { buildImpactSummary, buildVolunteerLeaderboard } from './public';

function emptyDb(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [], volunteerProfileNodes: [], teams: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [],
    impactDigests: [], workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: '2026-01-01T00:00:00.000Z' }
  };
}

describe('recomputeGamification', () => {
  it('handles empty state and seeds badge definitions', () => {
    const db = emptyDb();
    const summary = recomputeGamification(db, new Date('2026-01-02T00:00:00.000Z'));
    expect(summary.profilesUpdated).toBe(0);
    expect(db.badgeDefinitions.length).toBeGreaterThan(0);
    expect(buildImpactSummary(db).sectionsProcessed).toBe(0);
    expect(db.impactDigests).toEqual([]);
  });

  it('excludes private volunteers from public leaderboards', () => {
    const db = emptyDb();
    db.volunteerProfiles.push({ id: 'profile-1', displayName: 'Private Person', slug: 'private-person', privacyMode: 'private', publicProfileEnabled: false, avatarColor: '#fff', joinedAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null, statsUpdatedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    db.volunteerStatsSnapshots.push({ id: 'stats-1', volunteerProfileId: 'profile-1', window: 'all_time', windowStart: null, windowEnd: null, contributionScore: 100, sectionsProcessed: 10, packetsSubmitted: 10, formatValidatedSubmissions: 10, formatRejectedSubmissions: 0, consensusPassedContributions: 0, consensusFailedContributions: 0, humanReviewedAcceptedContributions: 0, idleMinutesDonated: 0, distinctActiveDays: 1, currentStreakDays: 1, longestStreakDays: 1, badgesCount: 0, computedAt: '2026-01-01T00:00:00.000Z' });
    expect(buildVolunteerLeaderboard(db)).toEqual([]);
  });
});

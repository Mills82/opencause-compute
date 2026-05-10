import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { issueProfileSetupToken, readProfileSetup, updateProfileSetup } from './profile-setup';

function db(): DatabaseState {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [{ id: '00000000-0000-0000-0000-000000000001', displayName: 'Volunteer 0001', slug: 'volunteer-0001', privacyMode: 'private', publicProfileEnabled: false, avatarColor: '#fff', joinedAt: now, lastActiveAt: now, statsUpdatedAt: null, createdAt: now, updatedAt: now }],
    volunteerProfileNodes: [], teams: [{ id: '00000000-0000-0000-0000-000000000002', name: 'Public Team', slug: 'public-team', description: '', visibility: 'public', createdAt: now, updatedAt: now, statsUpdatedAt: null }], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [], impactDigests: [], impactCards: [], projectCorpusEstimates: [], publicReports: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: now }
  };
}

describe('profile setup tokens', () => {
  it('allows token holder to update privacy and join a public team', () => {
    const state = db();
    const token = issueProfileSetupToken(state.volunteerProfiles[0], new Date('2026-01-01T00:00:00.000Z'));
    expect(readProfileSetup(state, token).profile.privacyMode).toBe('private');
    const updated = updateProfileSetup(state, { token, displayName: 'Named Volunteer', privacyMode: 'public_named', publicProfileEnabled: true, teamId: state.teams[0].id });
    expect(updated.displayName).toBe('Named Volunteer');
    expect(updated.publicProfileEnabled).toBe(true);
    expect(state.teamMemberships[0].teamId).toBe(state.teams[0].id);
  });

  it('rejects invalid token', () => {
    expect(() => readProfileSetup(db(), 'bad')).toThrow('invalid_or_expired_profile_setup_token');
  });
});

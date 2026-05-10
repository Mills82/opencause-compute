import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { POST } from '../app/api/report-public-content/route';

const OLD_ENV = { ...process.env };
afterEach(() => { process.env = { ...OLD_ENV }; vi.restoreAllMocks(); });

function db(): DatabaseState {
  const now = new Date().toISOString();
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [], volunteerProfileNodes: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [], impactDigests: [], projectCorpusEstimates: [], publicReports: [],
    volunteerProfiles: [{ id: 'profile-1', displayName: 'P', slug: 'public-profile', privacyMode: 'public_named', publicProfileEnabled: true, avatarColor: '#fff', joinedAt: now, createdAt: now, updatedAt: now, moderationStatus: 'ok' }],
    teams: [{ id: 'team-1', name: 'Team', slug: 'public-team', description: '', visibility: 'public', createdAt: now, updatedAt: now, statsUpdatedAt: null, moderationStatus: 'ok' }],
    impactCards: [{ id: 'card-1', volunteerProfileId: 'profile-1', cardType: 'volunteer_weekly', slug: 'public-card', title: 'Card', subtitle: '', metricLabel: 'Packets', metricValue: '1', accentColor: '#fff', publicEnabled: true, periodStart: now, periodEnd: now, createdAt: now, moderationStatus: 'ok' }],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: now }
  };
}

vi.mock('../lib/db', () => ({
  withDb: async (fn: (state: DatabaseState) => unknown) => fn(testDb),
  loadDb: async () => testDb
}));

vi.mock('../lib/relational-app', () => ({ createPublicReportRelational: async () => undefined }));

let testDb: DatabaseState;

function report(body: Record<string, unknown>, ip = '1.2.3.4') {
  return POST(new Request('http://localhost/api/report-public-content', { method: 'POST', headers: { 'x-real-ip': ip }, body: JSON.stringify(body) }));
}

describe('public report abuse controls', () => {
  it('creates a report for a valid public target while preserving unrelated state', async () => {
    testDb = db();
    testDb.claims.push({ id: 'claim-1', workPacketId: 'packet-1', nodeId: 'node-1', status: 'claimed', claimedAt: new Date().toISOString(), leaseExpiresAt: new Date().toISOString() });
    const response = await report({ targetType: 'team', targetSlug: 'public-team', reason: 'spam', details: ' bad ', reporterContact: ' me@example.com ' });
    expect(response.status).toBe(202);
    expect(testDb.publicReports).toHaveLength(1);
    expect(testDb.publicReports[0]).toMatchObject({ targetType: 'team', targetSlug: 'public-team', reason: 'spam', details: 'bad', reporterContact: 'me@example.com' });
    expect(testDb.claims).toHaveLength(1);
  });

  it('returns generic success for missing/private/hidden targets without creating report', async () => {
    testDb = db();
    testDb.teams[0].visibility = 'private';
    const response = await report({ targetType: 'team', targetSlug: 'public-team', reason: 'spam' }, '1.2.3.5');
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, status: 'received' });
    expect(testDb.publicReports).toHaveLength(0);
  });

  it('requires Turnstile in hosted mode', async () => {
    testDb = db();
    process.env.OPENCAUSE_HOSTED = 'true';
    const response = await report({ targetType: 'team', targetSlug: 'public-team', reason: 'spam' }, '1.2.3.6');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'verification_required' });
  });

  it('limits duplicate reports without leaking target state', async () => {
    testDb = db();
    const body = { targetType: 'team', targetSlug: 'public-team', reason: 'spam', reporterContact: 'me@example.com' };
    expect((await report(body, '1.2.3.7')).status).toBe(202);
    const duplicate = await report(body, '1.2.3.7');
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toEqual({ ok: true, status: 'received' });
    expect(testDb.publicReports).toHaveLength(1);
  });

  it('rate limits public reports separately', async () => {
    testDb = db();
    for (let i = 0; i < 5; i += 1) {
      const response = await report({ targetType: 'impact_card', targetSlug: 'public-card', reason: `spam-${i}` }, '9.9.9.9');
      expect(response.status).toBe(202);
    }
    const limited = await report({ targetType: 'impact_card', targetSlug: 'public-card', reason: 'spam-limited' }, '9.9.9.9');
    expect(limited.status).toBe(429);
  });
});

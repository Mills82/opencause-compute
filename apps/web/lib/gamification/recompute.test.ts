import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { recomputeGamification } from './recompute';
import { buildCancerKnowledgeMinerProgressEstimate, buildImpactSummary, buildVolunteerLeaderboard } from './public';

function emptyDb(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], ingestionRuns: [], auditEvents: [], volunteerEnrollments: [],
    volunteerProfiles: [], volunteerProfileNodes: [], teams: [], teamMemberships: [], badgeDefinitions: [], volunteerBadges: [], volunteerStatsSnapshots: [], teamStatsSnapshots: [],
    impactDigests: [], impactCards: [], projectCorpusEstimates: [], publicReports: [], workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: '2026-01-01T00:00:00.000Z' }
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

  it('counts all format-valid triage outcomes as structure-validated submissions', () => {
    const db = emptyDb();
    db.volunteerProfiles.push({ id: 'profile-1', displayName: 'Volunteer', slug: 'volunteer', privacyMode: 'private', publicProfileEnabled: false, avatarColor: '#fff', joinedAt: '2026-01-01T00:00:00.000Z', lastActiveAt: null, statsUpdatedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    db.volunteerProfileNodes.push({ id: 'link-1', volunteerProfileId: 'profile-1', nodeId: 'node-1', attachedAt: '2026-01-01T00:00:00.000Z', detachedAt: null });
    db.nodes.push({ id: 'node-1', nodeName: 'Node', platform: 'linux', version: '0.1.0', capabilities: [], status: 'online', registeredAt: '2026-01-01T00:00:00.000Z', lastHeartbeatAt: null });
    for (const [index, decision] of ['extract_now', 'skip_non_cancer', 'low_opportunity'].entries()) {
      db.results.push({ id: `result-${index}`, workPacketId: `packet-${index}`, nodeId: 'node-1', claimId: `claim-${index}`, extractorVersion: 'Local LLM v1', resultHash: `hash-${index}`, validated: true, formatValidated: true, consensusStatus: 'consensus_pending', reviewStatus: 'not_reviewed', validationErrors: [], warnings: [], summary: 'ok', submittedAt: `2026-01-01T00:0${index}:00.000Z`, provenance: { packetTriage: { decision } } });
    }

    recomputeGamification(db, new Date('2026-01-02T00:00:00.000Z'));

    expect(db.volunteerStatsSnapshots[0].formatValidatedSubmissions).toBe(3);
    expect(db.impactDigests[0].formatValidatedSubmissions).toBe(3);
  });

  it('estimates Cancer Knowledge Miner packet progress from eligible documents and ingestion averages', () => {
    const db = emptyDb();
    db.projects.push({ id: 'project-1', slug: 'cancer-knowledge-miner', name: 'Cancer Knowledge Miner', description: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' });
    db.projectCorpusEstimates.push({ id: 'estimate-1', projectId: 'project-1', corpusSource: 'pmc_oa', query: 'cancer', eligibleDocumentCount: 1000, ingestedDocumentCount: 10, packetsCreatedFromIngestedDocuments: 100, averagePacketsPerDocument: 10, estimatedTotalPackets: 10000, estimateMethod: 'pmc_open_access_documents_times_mean_packets_per_full_text_document', refreshStatus: 'success', failureReason: null, refreshedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    db.volunteerStatsSnapshots.push({ id: 'stats-1', volunteerProfileId: 'profile-1', window: 'all_time', windowStart: null, windowEnd: null, contributionScore: 100, sectionsProcessed: 10, packetsSubmitted: 10, formatValidatedSubmissions: 10, formatRejectedSubmissions: 0, consensusPassedContributions: 25, consensusFailedContributions: 0, humanReviewedAcceptedContributions: 0, idleMinutesDonated: 0, distinctActiveDays: 1, currentStreakDays: 1, longestStreakDays: 1, badgesCount: 0, computedAt: '2026-01-01T00:00:00.000Z' });

    const estimate = buildCancerKnowledgeMinerProgressEstimate(db);
    expect(estimate.averagePacketsPerDocument).toBe(10);
    expect(estimate.estimatedTotalPackets).toBe(10000);
    expect(estimate.consensusCompletedPackets).toBe(25);
    expect(estimate.percentComplete).toBeCloseTo(0.25);
  });
});

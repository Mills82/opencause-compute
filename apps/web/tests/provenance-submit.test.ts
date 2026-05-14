import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resultPayloadSchema, resultProvenanceSchema, type DatabaseState, type ResultProvenance, type WorkPacket } from '@opencause/shared';
import { submitResult } from '../lib/coordinator';
import { signWorkPacketPayload } from '../lib/signing';

function dbWithClaim(): { db: DatabaseState; packet: WorkPacket; claimId: string; nodeId: string } {
  const now = new Date().toISOString();
  const nodeId = randomUUID();
  const claimId = randomUUID();
  const payload = {
    id: randomUUID(),
    projectId: randomUUID(),
    title: 'Climate',
    sourceText: 'The district receives average rainfall and has 312 rainy days.',
    sourceCitation: 'PMCID: PMC12345',
    sourceUrl: 'https://example.com/packet',
    inputHash: 'hash',
    extractor: 'local-llm-v2' as const,
    createdAt: now
  };
  const packet: WorkPacket = {
    ...payload,
    signature: signWorkPacketPayload(payload),
    status: 'claimed',
    updatedAt: now
  };
  const db = {
    projects: [{ id: payload.projectId, slug: 'p', name: 'P', description: 'D', status: 'active', createdAt: now }],
    workPackets: [packet],
    nodes: [{ id: nodeId, nodeName: 'n', platform: 'win32', version: '0.1.0', capabilities: ['local-llm-v2'], status: 'online', registeredAt: now, lastHeartbeatAt: now }],
    claims: [{ id: claimId, nodeId, workPacketId: packet.id, status: 'claimed' as const, claimedAt: now, leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(), completedAt: null }],
    results: [],
    extractedClaims: [],
    auditEvents: [],
    volunteerEnrollments: [],
    volunteerProfiles: [],
    volunteerProfileNodes: [],
    teams: [],
    teamMemberships: [],
    badgeDefinitions: [],
    volunteerBadges: [],
    volunteerStatsSnapshots: [],
    teamStatsSnapshots: [],
    impactDigests: [],
    impactCards: [],
    projectCorpusEstimates: [],
    publicReports: [],
    ingestionRuns: [],
    workerControl: { paused: false, idleMode: 'idle', minIdleSeconds: 60, maxCpuPercent: 80, runNowToken: 0, updatedAt: now }
  } as unknown as DatabaseState;
  return { db, packet, claimId, nodeId };
}

const triageProvenance: ResultProvenance = {
  workerVersion: '0.1.0',
  extractorVersion: 'Local LLM v2',
  modelName: 'llama3.2:3b',
  modelProvider: 'ollama',
  promptVersion: 'local-llm-v2-lite-prompt-2026-05-11',
  promptHash: 'hash',
  packetSchemaVersion: 'work-packet-v1',
  extractionTimestamp: new Date().toISOString(),
  workerPlatform: 'win32-x64',
  workerCapabilities: ['local-llm-v2'],
  resultValidationVersion: 'claims-v2',
  resultKind: 'triage_skip',
  extractionAttempted: false,
  packetTriage: {
    schemaVersion: 'packet-triage-v1',
    decision: 'skip_non_cancer',
    cancerRelevance: 0,
    claimOpportunity: 0.1,
    reason: 'No cancer-relevance terms found in packet.',
    suggestedNoClaimReason: 'no_cancer_claim',
    warnings: []
  }
};

describe('worker provenance submit path', () => {
  it('parses triage provenance through submit schemas', () => {
    const parsedProvenance = resultProvenanceSchema.parse(triageProvenance);
    const parsedResult = resultPayloadSchema.parse({ schemaVersion: 'claims-v2', claims: [], noClaimReason: 'no_cancer_claim', summary: 'Worker triage: skip.', warnings: ['packet_triage:skip_non_cancer'] });
    expect(parsedProvenance.resultKind).toBe('triage_skip');
    expect(parsedProvenance.extractionAttempted).toBe(false);
    expect(parsedProvenance.packetTriage?.decision).toBe('skip_non_cancer');
    expect(parsedResult.noClaimReason).toBe('no_cancer_claim');
  });

  it('stores triage provenance on extraction_results records', () => {
    const { db, packet, claimId, nodeId } = dbWithClaim();
    const output = submitResult(db, {
      nodeId,
      claimId,
      workPacketId: packet.id,
      extractorVersion: 'Local LLM v2',
      result: { schemaVersion: 'claims-v2', claims: [], noClaimReason: 'no_cancer_claim', summary: 'Worker triage: skip.', warnings: ['packet_triage:skip_non_cancer'] },
      provenance: triageProvenance
    });
    expect(output.record.provenance?.resultKind).toBe('triage_skip');
    expect(output.record.provenance?.extractionAttempted).toBe(false);
    expect(output.record.provenance?.packetTriage?.decision).toBe('skip_non_cancer');
    expect(db.results[0]?.provenance?.packetTriage?.schemaVersion).toBe('packet-triage-v1');
  });
});

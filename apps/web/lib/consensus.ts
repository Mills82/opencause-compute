import { createHash } from 'node:crypto';
import type { DatabaseState, ExtractedClaimRecord } from '@opencause/shared';
import { REQUIRED_CONSENSUS_SUBMISSIONS, REQUIRED_CONSENSUS_WEIGHT, resultConsensusWeight } from './consensus-scoring';

function norm(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function consensusClaimKey(claim: Pick<ExtractedClaimRecord, 'claimType' | 'cancerType' | 'biomarkerMention' | 'drugOrInterventionMention' | 'outcomeMention' | 'exactEvidenceSentence' | 'evidenceOrigin' | 'polarity' | 'direction'>): string {
  if (claim.evidenceOrigin === 'methods_only') return ['claims-v2', 'methods_only', hash(norm(claim.exactEvidenceSentence))].join('|');
  return ['claims-v2', claim.claimType, hash(norm(claim.exactEvidenceSentence)), claim.cancerType, claim.biomarkerMention, claim.drugOrInterventionMention, claim.outcomeMention, claim.polarity, claim.direction].map(norm).join('|');
}

export function updateConsensusForPacket(db: DatabaseState, packetId: string): 'consensus_pending' | 'consensus_passed' | 'consensus_failed' {
  const results = db.results.filter((result) => result.workPacketId === packetId && result.formatValidated);
  const distinctNodes = new Set(results.map((result) => result.nodeId));
  if (distinctNodes.size < REQUIRED_CONSENSUS_SUBMISSIONS) {
    for (const result of db.results.filter((candidate) => candidate.workPacketId === packetId)) result.consensusStatus = 'consensus_pending';
    return 'consensus_pending';
  }
  const resultById = new Map(results.map((result) => [result.id, result]));
  const nodesByKey = new Map<string, Map<string, number>>();
  const add = (key: string, resultId: string) => {
    const result = resultById.get(resultId);
    if (!result) return;
    const nodes = nodesByKey.get(key) ?? new Map<string, number>();
    nodes.set(result.nodeId, Math.max(nodes.get(result.nodeId) ?? 0, resultConsensusWeight(result)));
    nodesByKey.set(key, nodes);
  };
  for (const claim of (db.extractedClaims ?? []).filter((candidate) => resultById.has(candidate.resultId) && candidate.evidenceOrigin !== 'methods_only')) add(consensusClaimKey(claim), claim.resultId);
  const passed = [...nodesByKey.values()].some((nodes) => nodes.size >= REQUIRED_CONSENSUS_SUBMISSIONS && [...nodes.values()].reduce((sum, weight) => sum + weight, 0) >= REQUIRED_CONSENSUS_WEIGHT);
  const status = passed ? 'consensus_passed' : 'consensus_failed';
  for (const result of db.results.filter((candidate) => candidate.workPacketId === packetId)) {
    result.consensusStatus = status;
    if (status === 'consensus_failed') result.reviewStatus = 'needs_human_review';
  }
  return status;
}

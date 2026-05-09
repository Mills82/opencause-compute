import type { DatabaseState, ExtractedFactRecord } from '@opencause/shared';
import { REQUIRED_CONSENSUS_SUBMISSIONS, REQUIRED_CONSENSUS_WEIGHT, resultConsensusWeight } from './consensus-scoring';

function norm(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function consensusFactKey(fact: Pick<ExtractedFactRecord, 'relationshipType' | 'cancerType' | 'geneOrBiomarker' | 'drugOrCompound'>): string {
  return [fact.relationshipType, fact.cancerType, fact.geneOrBiomarker, fact.drugOrCompound].map(norm).join('|');
}

export function updateConsensusForPacket(db: DatabaseState, packetId: string): 'consensus_pending' | 'consensus_passed' | 'consensus_failed' {
  const results = db.results.filter((result) => result.workPacketId === packetId && result.formatValidated);
  const distinctNodes = new Set(results.map((result) => result.nodeId));
  if (distinctNodes.size < REQUIRED_CONSENSUS_SUBMISSIONS) {
    for (const result of db.results.filter((candidate) => candidate.workPacketId === packetId)) {
      result.consensusStatus = 'consensus_pending';
    }
    return 'consensus_pending';
  }

  const resultById = new Map(results.map((result) => [result.id, result]));
  const factNodesByKey = new Map<string, Map<string, number>>();
  for (const fact of db.facts.filter((candidate) => resultById.has(candidate.resultId))) {
    const result = resultById.get(fact.resultId);
    if (!result) continue;
    const key = consensusFactKey(fact);
    const nodes = factNodesByKey.get(key) ?? new Map<string, number>();
    nodes.set(result.nodeId, Math.max(nodes.get(result.nodeId) ?? 0, resultConsensusWeight(result)));
    factNodesByKey.set(key, nodes);
  }

  const passed = [...factNodesByKey.values()].some((nodes) => nodes.size >= REQUIRED_CONSENSUS_SUBMISSIONS && [...nodes.values()].reduce((sum, weight) => sum + weight, 0) >= REQUIRED_CONSENSUS_WEIGHT);
  const status = passed ? 'consensus_passed' : 'consensus_failed';
  for (const result of db.results.filter((candidate) => candidate.workPacketId === packetId)) {
    result.consensusStatus = status;
    if (status === 'consensus_failed') result.reviewStatus = 'needs_human_review';
  }
  return status;
}

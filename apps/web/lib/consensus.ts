import type { DatabaseState, ExtractedFactRecord } from '@opencause/shared';

export const REQUIRED_CONSENSUS_SUBMISSIONS = 2;

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

  const resultNode = new Map(results.map((result) => [result.id, result.nodeId]));
  const factNodesByKey = new Map<string, Set<string>>();
  for (const fact of db.facts.filter((candidate) => resultNode.has(candidate.resultId))) {
    const nodeId = resultNode.get(fact.resultId);
    if (!nodeId) continue;
    const key = consensusFactKey(fact);
    const nodes = factNodesByKey.get(key) ?? new Set<string>();
    nodes.add(nodeId);
    factNodesByKey.set(key, nodes);
  }

  const passed = [...factNodesByKey.values()].some((nodes) => nodes.size >= REQUIRED_CONSENSUS_SUBMISSIONS);
  const status = passed ? 'consensus_passed' : 'consensus_failed';
  for (const result of db.results.filter((candidate) => candidate.workPacketId === packetId)) {
    result.consensusStatus = status;
    if (status === 'consensus_failed') result.reviewStatus = 'needs_human_review';
  }
  return status;
}

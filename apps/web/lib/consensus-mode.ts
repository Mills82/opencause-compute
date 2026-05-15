export function consensusCollectOnly(): boolean {
  return process.env.OPENCAUSE_CONSENSUS_MODE === 'collect_only';
}

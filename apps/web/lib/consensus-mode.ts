export function consensusCollectOnly(): boolean {
  if (process.env.OPENCAUSE_CONSENSUS_MODE === 'normal') return false;
  if (process.env.OPENCAUSE_CONSENSUS_MODE === 'collect_only') return true;
  return process.env.NODE_ENV === 'production';
}

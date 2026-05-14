import type { ExtractionResult, ResultProvenance } from '@opencause/shared';

export const REQUIRED_CONSENSUS_SUBMISSIONS = 2;
export const REQUIRED_CONSENSUS_WEIGHT = 2;

export function provenanceWeight(provenance: ResultProvenance | undefined): number {
  const tier = provenance?.generationQualityTier ?? 'balanced';
  const base = tier === 'ultra' ? 1.25 : tier === 'high' ? 1.15 : tier === 'balanced' ? 1 : tier === 'low' ? 0.85 : 0.75;
  const options = provenance?.generationOptions ?? {};
  const ctx = typeof options.num_ctx === 'number' ? options.num_ctx : typeof options.numCtx === 'number' ? options.numCtx : 0;
  const temp = typeof options.temperature === 'number' ? options.temperature : undefined;
  const ctxBonus = ctx >= 12288 ? 0.08 : ctx >= 8192 ? 0.04 : 0;
  const deterministicBonus = temp === 0 ? 0.04 : 0;
  return Number(Math.min(1.35, Math.max(0.7, base + ctxBonus + deterministicBonus)).toFixed(2));
}

export function resultConsensusWeight(result: Pick<ExtractionResult, 'provenance' | 'formatValidated'>): number {
  if (!result.formatValidated) return 0;
  return provenanceWeight(result.provenance);
}

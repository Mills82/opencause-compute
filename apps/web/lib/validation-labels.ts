import type { ExtractionResult } from '@opencause/shared';

export function validationLevel(result: Pick<ExtractionResult, 'formatValidated' | 'validated' | 'consensusStatus' | 'reviewStatus'>):
  | 'format_validated'
  | 'consensus_pending'
  | 'consensus_passed'
  | 'consensus_failed'
  | 'needs_human_review'
  | 'human_reviewed' {
  if (result.reviewStatus === 'human_reviewed') return 'human_reviewed';
  if (result.reviewStatus === 'needs_human_review') return 'needs_human_review';
  if (result.consensusStatus === 'consensus_passed') return 'consensus_passed';
  if (result.consensusStatus === 'consensus_failed') return 'consensus_failed';
  if (result.consensusStatus === 'consensus_pending') return 'consensus_pending';
  return result.formatValidated ?? result.validated ? 'format_validated' : 'needs_human_review';
}

export function validationLevelDescription(level: ReturnType<typeof validationLevel>): string {
  switch (level) {
    case 'format_validated':
      return 'Schema/evidence format checks passed; no independent consensus yet.';
    case 'consensus_pending':
      return 'Raw submission is waiting for independent duplicate extraction and comparison.';
    case 'consensus_passed':
      return 'Independent outputs agreed under the consensus policy.';
    case 'consensus_failed':
      return 'Independent outputs disagreed or failed consensus policy.';
    case 'needs_human_review':
      return 'Automated validation or consensus requires human review.';
    case 'human_reviewed':
      return 'A human reviewer has reviewed this result.';
  }
}

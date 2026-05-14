# Consensus validation foundation

OpenCause Compute must not present a single worker's schema-valid output as an accepted scientific fact.

## Validation levels

- `format_validated`: output schema, evidence sentence, and citation attachment checks passed.
- `consensus_pending`: the raw submission needs independent duplicate extraction and comparison.
- `consensus_passed`: independent outputs agree under the consensus policy.
- `consensus_failed`: independent outputs disagree or fail consensus rules.
- `needs_human_review`: automated validation or consensus requires human review.
- `human_reviewed`: an authorized reviewer has reviewed the result.

## Current behavior

The current private-alpha worker submit path records raw submissions with:

- `formatValidated=true/false`
- `consensusStatus=consensus_pending`
- `reviewStatus=not_reviewed` for format-valid submissions
- `reviewStatus=needs_human_review` for format-invalid submissions

Admin UI labels these as raw submissions and explicitly warns not to treat them as accepted candidate evidence unless consensus or human review passes.

## Public-launch target

Before broad public launch:

1. Send selected packets to multiple independent workers.
2. Compare candidate evidence records structurally and semantically.
3. Promote only agreeing candidate evidence records to `consensus_passed`.
4. Mark disagreements as `consensus_failed` or `needs_human_review`.
5. Keep provenance and source evidence attached at every stage.
6. Separate raw submissions from consensus evidence in UI and export.

## First consensus mechanics

The worker submit path now keeps a format-valid packet queued until at least two distinct nodes submit results for it. The same node is not assigned the same completed-submission packet again while consensus is pending.

When two or more distinct nodes submit format-valid results, OpenCause computes a conservative structural consensus key from relationship type, cancer type, biomarker, and drug/compound. If at least one normalized fact key appears from two independent nodes, the packet's submissions are marked `consensus_passed`. If enough independent submissions exist but no fact key agrees, submissions are marked `consensus_failed` and require human review.

This is a foundation, not final scientific consensus. Public launch still needs semantic comparison, configurable thresholds, consensus fact exports, reviewer tooling, and clear provenance per accepted candidate fact.

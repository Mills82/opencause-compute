# Project progress estimates

Cancer Knowledge Miner should show mission progress as consensus-completed literature packets over an estimated eligible packet corpus.

## Metric definition

Public progress should use:

```text
consensus_completed_packets / estimated_total_packets
```

Where:

```text
estimated_total_packets = eligible_document_count * average_packets_per_ingested_document
average_packets_per_ingested_full_text_document = packets_created_from_completed_pmc_full_text_ingestion_runs / documents_ingested_by_completed_pmc_full_text_ingestion_runs
```

Use approximate language (`~`, `estimated`) until the full corpus has been enumerated and packetized.

## V1 source of truth

- Numerator: aggregate all-time `consensusPassedContributions` from gamification stats.
- Eligible document count: latest successful `project_corpus_estimates` row, refreshed daily from NCBI PMC count-only queries. V1 uses `db=pmc` and `cancer AND open access[filter]`.
- Average packets/document: completed PMC full-text ingestion runs for Cancer Knowledge Miner. Abstract-only PubMed ingestion is seed/fallback data and should not drive the full-text corpus denominator.
- Sample threshold: do not show a percentage/denominator until at least 10 ingested documents and at least 1 packet exist.

## UX rules

Show three separate concepts:

1. Consensus progress — the mission progress bar.
2. Structure-validated submissions — useful throughput, not final completion.
3. Estimate basis — e.g. `Estimated from 1,250 eligible documents and 42 ingested documents.`

Avoid implying medical/scientific validation. Label artifacts as literature sections/evidence candidates.

## Future improvements

- Add license-specific PMC corpus estimates, e.g. CC-BY vs broader open-access buckets.
- Once the corpus is fully enumerated and packetized, switch denominator to actual `COUNT(work_packets)` for the project.
- Use a trimmed mean/median packet count once enough per-document packet data is available.

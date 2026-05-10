import { randomUUID } from 'node:crypto';
import type { DatabaseState, ProjectCorpusEstimate } from '@opencause/shared';
import { fetchPubMedRecordCount } from '../ingestion/pubmed';

export const CKM_PROJECT_SLUG = 'cancer-knowledge-miner';
export const DEFAULT_CKM_QUERY = 'cancer AND open access[filter]';
export const PROGRESS_ESTIMATE_METHOD = 'pmc_open_access_documents_times_mean_packets_per_full_text_document';

export function computePacketEstimateInputs(db: DatabaseState) {
  const completedRuns = db.ingestionRuns.filter((run) =>
    (run.status === 'completed' || run.status === 'partial_failed')
    && run.sourceType === 'pmc_oa_full_text'
  );
  const ingestedDocumentCount = completedRuns.reduce((total, run) => total + run.fetchedCount, 0);
  const packetsCreatedFromIngestedDocuments = completedRuns.reduce((total, run) => total + run.packetsCreated + run.packetsSkipped, 0);
  const averagePacketsPerDocument = ingestedDocumentCount > 0 ? packetsCreatedFromIngestedDocuments / ingestedDocumentCount : 0;
  return { ingestedDocumentCount, packetsCreatedFromIngestedDocuments, averagePacketsPerDocument };
}

export async function buildPmcCorpusEstimateInput(options: { query: string; db: DatabaseState; email?: string; apiKey?: string }) {
  const eligibleDocumentCount = await fetchPubMedRecordCount({ db: 'pmc', query: options.query, email: options.email, apiKey: options.apiKey });
  const inputs = computePacketEstimateInputs(options.db);
  return {
    corpusSource: 'pmc_oa' as const,
    query: options.query,
    eligibleDocumentCount,
    ...inputs,
    estimatedTotalPackets: Math.max(0, Math.round(eligibleDocumentCount * inputs.averagePacketsPerDocument)),
    estimateMethod: PROGRESS_ESTIMATE_METHOD
  };
}

export function upsertProjectCorpusEstimate(db: DatabaseState, input: Omit<ProjectCorpusEstimate, 'id' | 'refreshStatus' | 'failureReason' | 'refreshedAt' | 'createdAt' | 'updatedAt'> & { refreshStatus?: 'success' | 'failed'; failureReason?: string | null }, now = new Date()): ProjectCorpusEstimate {
  const timestamp = now.toISOString();
  const existing = db.projectCorpusEstimates.find((estimate) => estimate.projectId === input.projectId && estimate.corpusSource === input.corpusSource && estimate.query === input.query);
  const estimate: ProjectCorpusEstimate = {
    id: existing?.id ?? randomUUID(),
    projectId: input.projectId,
    corpusSource: input.corpusSource,
    query: input.query,
    eligibleDocumentCount: input.eligibleDocumentCount,
    ingestedDocumentCount: input.ingestedDocumentCount,
    packetsCreatedFromIngestedDocuments: input.packetsCreatedFromIngestedDocuments,
    averagePacketsPerDocument: input.averagePacketsPerDocument,
    estimatedTotalPackets: input.estimatedTotalPackets,
    estimateMethod: input.estimateMethod,
    refreshStatus: input.refreshStatus ?? 'success',
    failureReason: input.failureReason ?? null,
    refreshedAt: timestamp,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  if (existing) Object.assign(existing, estimate);
  else db.projectCorpusEstimates.unshift(estimate);
  return estimate;
}

import { randomUUID } from 'node:crypto';
import type { DatabaseState, IngestionRun } from '@opencause/shared';
import { recordAuditEvent } from '../audit';

export type StartIngestionRunInput = Pick<
  IngestionRun,
  'sourceType' | 'mode' | 'query' | 'retmax' | 'usedNcbiEmail' | 'usedNcbiApiKey'
>;

export type CompleteIngestionRunInput = Partial<
  Pick<IngestionRun, 'fetchedCount' | 'skippedCount' | 'failedCount' | 'failureReasons' | 'packetsCreated' | 'packetsSkipped'>
> & { status?: IngestionRun['status'] };

export function startIngestionRun(db: DatabaseState, input: StartIngestionRunInput): IngestionRun {
  const now = new Date().toISOString();
  const run: IngestionRun = {
    id: randomUUID(),
    sourceType: input.sourceType,
    mode: input.mode,
    status: 'running',
    query: input.query,
    retmax: input.retmax,
    startedAt: now,
    completedAt: null,
    fetchedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failureReasons: [],
    packetsCreated: 0,
    packetsSkipped: 0,
    usedNcbiEmail: input.usedNcbiEmail,
    usedNcbiApiKey: input.usedNcbiApiKey
  };
  db.ingestionRuns.unshift(run);
  db.ingestionRuns = db.ingestionRuns.slice(0, 100);
  recordAuditEvent(db, {
    actorType: input.mode === 'cron' ? 'cron' : 'admin',
    action: 'ingestion.started',
    targetType: 'ingestion_run',
    targetId: run.id,
    metadata: { sourceType: input.sourceType, query: input.query, retmax: input.retmax }
  });
  return run;
}

export function completeIngestionRun(
  db: DatabaseState,
  runId: string,
  input: CompleteIngestionRunInput
): IngestionRun {
  const run = db.ingestionRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error('ingestion_run_not_found');
  run.status = input.status ?? (input.failedCount && input.failedCount > 0 ? 'partial_failed' : 'completed');
  run.completedAt = new Date().toISOString();
  run.fetchedCount = input.fetchedCount ?? run.fetchedCount;
  run.skippedCount = input.skippedCount ?? run.skippedCount;
  run.failedCount = input.failedCount ?? run.failedCount;
  run.failureReasons = input.failureReasons ?? run.failureReasons;
  run.packetsCreated = input.packetsCreated ?? run.packetsCreated;
  run.packetsSkipped = input.packetsSkipped ?? run.packetsSkipped;
  recordAuditEvent(db, {
    actorType: run.mode === 'cron' ? 'cron' : 'admin',
    action: `ingestion.${run.status}`,
    targetType: 'ingestion_run',
    targetId: run.id,
    metadata: {
      sourceType: run.sourceType,
      fetchedCount: run.fetchedCount,
      skippedCount: run.skippedCount,
      failedCount: run.failedCount,
      packetsCreated: run.packetsCreated,
      packetsSkipped: run.packetsSkipped
    }
  });
  return run;
}

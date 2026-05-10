import { NextResponse } from 'next/server';
import { withDb } from '../../../../../lib/db';
import { createWorkPacketsFromSources, getOrCreateProject } from '../../../../../lib/coordinator';
import { completeIngestionRun, startIngestionRun } from '../../../../../lib/ingestion/runs';
import { isAdminAuthorized, isCronAuthorized } from '../../../../../lib/admin-auth';
import { fetchPubMedRecords } from '../../../../../lib/ingestion/pubmed';
import { ingestPmcOaFullTextWithReport } from '../../../../../lib/ingestion/pmc-oa';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';
import { completeIngestionRunRelational, ingestSourcesRelational, queueSnapshotRelational, startIngestionRunRelational } from '../../../../../lib/relational-app';

const DEFAULT_QUERY = 'cancer biomarker response resistance';
const DEFAULT_PROJECT_SLUG = 'cancer-knowledge-miner';
const DEFAULT_PROJECT_NAME = 'Cancer Knowledge Miner';
const DEFAULT_PROJECT_DESCRIPTION = 'Processes open-access oncology and biomedical literature into structured, citation-backed facts.';

function parseEnvInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getCronConfig() {
  const projectSlug = process.env.CRON_PROJECT_SLUG ?? DEFAULT_PROJECT_SLUG;
  const projectName = process.env.CRON_PROJECT_NAME ?? DEFAULT_PROJECT_NAME;
  const projectDescription = process.env.CRON_PROJECT_DESCRIPTION ?? DEFAULT_PROJECT_DESCRIPTION;
  return {
    projectSlug,
    projectName,
    projectDescription,
    pubmedQuery: process.env.CRON_PUBMED_QUERY ?? DEFAULT_QUERY,
    pubmedRetmax: parseEnvInt(process.env.CRON_PUBMED_RETMAX, 100, 1, 250),
    queueTarget: parseEnvInt(process.env.CRON_QUEUE_TARGET, 1000, 1, 10000),
    maxPacketsPerRun: parseEnvInt(process.env.CRON_MAX_PACKETS_PER_RUN, 100, 1, 250),
    enablePmcOa: process.env.CRON_ENABLE_PMC_OA === 'true',
    pmcQuery: process.env.CRON_PMC_OA_QUERY ?? process.env.CRON_PUBMED_QUERY ?? DEFAULT_QUERY,
    pmcRetmax: parseEnvInt(process.env.CRON_PMC_OA_RETMAX, 6, 1, 50)
  };
}

async function queueSnapshot() {
  const relationalSnapshot = await queueSnapshotRelational();
  if (relationalSnapshot) return relationalSnapshot;
  return withDb((db) => {
    const packetIdsWithResults = new Set(db.results.map((result) => result.workPacketId));
    const awaitingIndependentValidation = db.workPackets.filter((packet) => packet.status === 'queued' && packetIdsWithResults.has(packet.id)).length;
    const availableToFirstPass = db.workPackets.filter((packet) => packet.status === 'queued' && !packetIdsWithResults.has(packet.id)).length;
    return {
      totalPackets: db.workPackets.length,
      queuedPackets: db.workPackets.filter((packet) => packet.status === 'queued').length,
      availableToFirstPass,
      awaitingIndependentValidation,
      completedPackets: db.workPackets.filter((packet) => packet.status === 'completed').length,
      claimedPackets: db.workPackets.filter((packet) => packet.status === 'claimed').length
    };
  });
}

async function runIngestion() {
  const config = getCronConfig();
  const beforeQueue = await queueSnapshot();
  const queueDeficit = Math.max(0, config.queueTarget - beforeQueue.totalPackets);
  const pubmedRetmax = Math.min(config.maxPacketsPerRun, queueDeficit);
  const pmcRetmax = config.enablePmcOa && queueDeficit > pubmedRetmax ? Math.min(config.pmcRetmax, config.maxPacketsPerRun - pubmedRetmax, queueDeficit - pubmedRetmax) : 0;

  if (queueDeficit <= 0) return { skipped: true, reason: 'queue_target_met', queueTarget: config.queueTarget, beforeQueue };

  const run = (await startIngestionRunRelational({ sourceType: 'combined', mode: 'cron', query: `${config.pubmedQuery} | ${config.pmcQuery}`, retmax: pubmedRetmax + pmcRetmax, usedNcbiEmail: Boolean(process.env.NCBI_EMAIL), usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY) })) ?? await withDb((db) => startIngestionRun(db, { sourceType: 'combined', mode: 'cron', query: `${config.pubmedQuery} | ${config.pmcQuery}`, retmax: pubmedRetmax + pmcRetmax, usedNcbiEmail: Boolean(process.env.NCBI_EMAIL), usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY) }));

  try {
    const [pubmedRecords, pmcReport] = await Promise.all([
      fetchPubMedRecords({ query: config.pubmedQuery, retmax: pubmedRetmax, retstart: beforeQueue.totalPackets, email: process.env.NCBI_EMAIL, apiKey: process.env.NCBI_API_KEY }),
      pmcRetmax > 0 ? ingestPmcOaFullTextWithReport({ query: config.pmcQuery, retmax: pmcRetmax, email: process.env.NCBI_EMAIL, apiKey: process.env.NCBI_API_KEY }) : Promise.resolve({ recordsFetched: 0, pmcRecords: 0, documentsIngested: 0, sources: [], failures: [], skippedCount: 0 })
    ]);
    const pubmedSources = pubmedRecords.map((record) => ({ title: record.title, sourceText: record.abstractText, sourceCitation: record.sourceCitation, sourceUrl: record.sourceUrl, sourcePublishedAt: record.sourcePublishedAt }));
    const relationalPubmed = await ingestSourcesRelational({ projectSlug: config.projectSlug, projectName: config.projectName, projectDescription: config.projectDescription, sources: pubmedSources, extractor: 'local-llm-v1' });
    const output = relationalPubmed ? await (async () => {
      const pmcOa = await ingestSourcesRelational({ projectSlug: config.projectSlug, projectName: config.projectName, projectDescription: config.projectDescription, sources: pmcReport.sources, extractor: 'local-llm-v1' });
      if (!pmcOa) throw new Error('relational_ingest_unavailable');
      const runSummary = await completeIngestionRunRelational(run.id, { fetchedCount: pubmedRecords.length + pmcReport.documentsIngested, skippedCount: Math.max(pubmedRetmax - pubmedRecords.length, 0) + pmcReport.skippedCount, failedCount: pmcReport.failures.length, failureReasons: pmcReport.failures.map((failure) => `${failure.pmcid ?? failure.pmid}:${failure.reason}`), packetsCreated: relationalPubmed.packetsCreated + pmcOa.packetsCreated, packetsSkipped: relationalPubmed.packetsSkipped + pmcOa.packetsSkipped });
      return { project: relationalPubmed.project, queueTarget: config.queueTarget, beforeQueue, pubmedFetched: pubmedRecords.length, pmcChunksFetched: pmcReport.sources.length, packetsCreated: relationalPubmed.packetsCreated + pmcOa.packetsCreated, packetsSkipped: relationalPubmed.packetsSkipped + pmcOa.packetsSkipped, pubmed: { packetsCreated: relationalPubmed.packetsCreated, packetsSkipped: relationalPubmed.packetsSkipped }, pmcOa: { packetsCreated: pmcOa.packetsCreated, packetsSkipped: pmcOa.packetsSkipped }, pmcFailures: pmcReport.failures, run: runSummary };
    })() : await withDb((db) => {
      const project = getOrCreateProject(db, { slug: config.projectSlug, name: config.projectName, description: config.projectDescription });
      const pubmed = createWorkPacketsFromSources(db, { projectId: project.id, sources: pubmedSources, extractor: 'local-llm-v1' });
      const pmcOa = createWorkPacketsFromSources(db, { projectId: project.id, sources: pmcReport.sources, extractor: 'local-llm-v1' });
      const completedRun = completeIngestionRun(db, run.id, { fetchedCount: pubmedRecords.length + pmcReport.documentsIngested, skippedCount: Math.max(pubmedRetmax - pubmedRecords.length, 0) + pmcReport.skippedCount, failedCount: pmcReport.failures.length, failureReasons: pmcReport.failures.map((failure) => `${failure.pmcid ?? failure.pmid}:${failure.reason}`), packetsCreated: pubmed.packetsCreated + pmcOa.packetsCreated, packetsSkipped: pubmed.packetsSkipped + pmcOa.packetsSkipped });
      return { project, queueTarget: config.queueTarget, beforeQueue, pubmedFetched: pubmedRecords.length, pmcChunksFetched: pmcReport.sources.length, packetsCreated: pubmed.packetsCreated + pmcOa.packetsCreated, packetsSkipped: pubmed.packetsSkipped + pmcOa.packetsSkipped, pubmed, pmcOa, pmcFailures: pmcReport.failures, run: completedRun };
    });
    return { ...output, afterQueue: await queueSnapshot() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'cron_ingest_failed';
    const failedRun = (await completeIngestionRunRelational(run.id, { status: 'failed', failedCount: 1, failureReasons: [reason] })) ?? await withDb((db) => completeIngestionRun(db, run.id, { status: 'failed', failedCount: 1, failureReasons: [reason] }));
    throw Object.assign(new Error(reason), { run: failedRun });
  }
}

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ingest = await runIngestion();
  return NextResponse.json({ ok: true, mode: 'cron', ingest });
}

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request) && !isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ingest = await runIngestion();
  return NextResponse.json({ ok: true, mode: 'manual', ingest });
}

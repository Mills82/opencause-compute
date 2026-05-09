import { NextResponse } from 'next/server';
import { withDb } from '../../../../../lib/db';
import { createWorkPacketsFromSources, getOrCreateProject } from '../../../../../lib/coordinator';
import { completeIngestionRun, startIngestionRun } from '../../../../../lib/ingestion/runs';
import { isAdminAuthorized, isCronAuthorized } from '../../../../../lib/admin-auth';
import { fetchPubMedRecords } from '../../../../../lib/ingestion/pubmed';
import { ingestPmcOaFullTextWithReport } from '../../../../../lib/ingestion/pmc-oa';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';

const DEFAULT_QUERY = 'cancer biomarker response resistance';
const DEFAULT_PROJECT_SLUG = 'cancer-knowledge-miner';
const DEFAULT_PROJECT_NAME = 'Cancer Knowledge Miner';
const DEFAULT_PROJECT_DESCRIPTION =
  'Processes open-access oncology and biomedical literature into structured, citation-backed facts.';

function parseEnvInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
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
    pubmedRetmax: parseEnvInt(process.env.CRON_PUBMED_RETMAX, 12, 1, 100),
    pmcQuery: process.env.CRON_PMC_OA_QUERY ?? process.env.CRON_PUBMED_QUERY ?? DEFAULT_QUERY,
    pmcRetmax: parseEnvInt(process.env.CRON_PMC_OA_RETMAX, 6, 1, 50)
  };
}

async function runIngestion() {
  const config = getCronConfig();

  const run = await withDb((db) =>
    startIngestionRun(db, {
      sourceType: 'combined',
      mode: 'cron',
      query: `${config.pubmedQuery} | ${config.pmcQuery}`,
      retmax: config.pubmedRetmax + config.pmcRetmax,
      usedNcbiEmail: Boolean(process.env.NCBI_EMAIL),
      usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY)
    })
  );

  try {
    const [pubmedRecords, pmcReport] = await Promise.all([
      fetchPubMedRecords({
      query: config.pubmedQuery,
      retmax: config.pubmedRetmax,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    }),
      ingestPmcOaFullTextWithReport({
      query: config.pmcQuery,
      retmax: config.pmcRetmax,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
      })
    ]);

  const pubmedSources = pubmedRecords.map((record) => ({
    title: record.title,
    sourceText: record.abstractText,
    sourceCitation: record.sourceCitation,
    sourceUrl: record.sourceUrl,
    sourcePublishedAt: record.sourcePublishedAt
  }));

  const output = await withDb((db) => {
    const project = getOrCreateProject(db, {
      slug: config.projectSlug,
      name: config.projectName,
      description: config.projectDescription
    });

    const pubmed = createWorkPacketsFromSources(db, {
      projectId: project.id,
      sources: pubmedSources,
      extractor: 'local-llm-v1'
    });

    const pmcOa = createWorkPacketsFromSources(db, {
      projectId: project.id,
      sources: pmcReport.sources,
      extractor: 'local-llm-v1'
    });

    const completedRun = completeIngestionRun(db, run.id, {
      fetchedCount: pubmedRecords.length + pmcReport.sources.length,
      skippedCount: Math.max(config.pubmedRetmax - pubmedRecords.length, 0) + pmcReport.skippedCount,
      failedCount: pmcReport.failures.length,
      failureReasons: pmcReport.failures.map((failure) => `${failure.pmcid ?? failure.pmid}:${failure.reason}`),
      packetsCreated: pubmed.packetsCreated + pmcOa.packetsCreated,
      packetsSkipped: pubmed.packetsSkipped + pmcOa.packetsSkipped
    });

    return {
      project,
      pubmedFetched: pubmedRecords.length,
      pmcChunksFetched: pmcReport.sources.length,
      packetsCreated: pubmed.packetsCreated + pmcOa.packetsCreated,
      packetsSkipped: pubmed.packetsSkipped + pmcOa.packetsSkipped,
      pubmed,
      pmcOa,
      pmcFailures: pmcReport.failures,
      run: completedRun
    };
  });

    return output;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'cron_ingest_failed';
    const failedRun = await withDb((db) =>
      completeIngestionRun(db, run.id, {
        status: 'failed',
        failedCount: 1,
        failureReasons: [reason]
      })
    );
    throw Object.assign(new Error(reason), { run: failedRun });
  }
}

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ingest = await runIngestion();
  return NextResponse.json({ ok: true, mode: 'cron', ingest });
}

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request) && !isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ingest = await runIngestion();
  return NextResponse.json({ ok: true, mode: 'manual', ingest });
}

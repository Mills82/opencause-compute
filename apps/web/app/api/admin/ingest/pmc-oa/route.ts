import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../../../lib/db';
import { createWorkPacketsFromSources, getOrCreateProject } from '../../../../../lib/coordinator';
import { completeIngestionRun, startIngestionRun } from '../../../../../lib/ingestion/runs';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { ingestPmcOaFullTextWithReport } from '../../../../../lib/ingestion/pmc-oa';
import { completeIngestionRunRelational, ingestSourcesRelational, startIngestionRunRelational } from '../../../../../lib/relational-app';

const requestSchema = z.object({
  query: z.string().min(3),
  retmax: z.number().int().min(1).max(50).default(10),
  projectSlug: z.string().min(3).default('cancer-knowledge-miner'),
  projectName: z.string().min(3).default('Cancer Knowledge Miner'),
  projectDescription: z.string().default('Processes open-access oncology and biomedical literature into structured, citation-backed facts.')
});

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const options = parsed.data;
  const run = (await startIngestionRunRelational({ sourceType: 'pmc_oa_full_text', mode: 'manual', query: options.query, retmax: options.retmax, usedNcbiEmail: Boolean(process.env.NCBI_EMAIL), usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY) })) ?? await withDb((db) => startIngestionRun(db, { sourceType: 'pmc_oa_full_text', mode: 'manual', query: options.query, retmax: options.retmax, usedNcbiEmail: Boolean(process.env.NCBI_EMAIL), usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY) }));
  try {
    const report = await ingestPmcOaFullTextWithReport({ query: options.query, retmax: options.retmax, email: process.env.NCBI_EMAIL, apiKey: process.env.NCBI_API_KEY });
    const relationalPackets = await ingestSourcesRelational({ projectSlug: options.projectSlug, projectName: options.projectName, projectDescription: options.projectDescription, sources: report.sources, extractor: 'local-llm-v1' });
    const output = relationalPackets ? {
      project: relationalPackets.project,
      fetchedChunks: report.sources.length,
      recordsFetched: report.recordsFetched,
      pmcRecords: report.pmcRecords,
      documentsIngested: report.documentsIngested,
      failures: report.failures,
      packetsCreated: relationalPackets.packetsCreated,
      packetsSkipped: relationalPackets.packetsSkipped,
      run: await completeIngestionRunRelational(run.id, { fetchedCount: report.documentsIngested, skippedCount: report.skippedCount, failedCount: report.failures.length, failureReasons: report.failures.map((failure) => `${failure.pmcid ?? failure.pmid}:${failure.reason}`), packetsCreated: relationalPackets.packetsCreated, packetsSkipped: relationalPackets.packetsSkipped })
    } : await withDb((db) => {
      const project = getOrCreateProject(db, { slug: options.projectSlug, name: options.projectName, description: options.projectDescription });
      const packetSummary = createWorkPacketsFromSources(db, { projectId: project.id, sources: report.sources, extractor: 'local-llm-v1' });
      const completedRun = completeIngestionRun(db, run.id, { fetchedCount: report.documentsIngested, skippedCount: report.skippedCount, failedCount: report.failures.length, failureReasons: report.failures.map((failure) => `${failure.pmcid ?? failure.pmid}:${failure.reason}`), packetsCreated: packetSummary.packetsCreated, packetsSkipped: packetSummary.packetsSkipped });
      return { project, fetchedChunks: report.sources.length, recordsFetched: report.recordsFetched, pmcRecords: report.pmcRecords, failures: report.failures, ...packetSummary, run: completedRun };
    });
    return NextResponse.json({ ingest: output });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'pmc_oa_ingest_failed';
    const failedRun = (await completeIngestionRunRelational(run.id, { status: 'failed', failedCount: 1, failureReasons: [reason] })) ?? await withDb((db) => completeIngestionRun(db, run.id, { status: 'failed', failedCount: 1, failureReasons: [reason] }));
    return NextResponse.json({ error: reason, run: failedRun }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../../../lib/db';
import { createWorkPacketsFromSources, getOrCreateProject } from '../../../../../lib/coordinator';
import { completeIngestionRun, startIngestionRun } from '../../../../../lib/ingestion/runs';
import { fetchPubMedRecords } from '../../../../../lib/ingestion/pubmed';
import { checkNamedRateLimit, rateLimitResponse } from '../../../../../lib/rate-limit';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';

const requestSchema = z.object({
  query: z.string().min(3),
  retmax: z.number().int().min(1).max(100).default(20),
  projectSlug: z.string().min(3).default('cancer-knowledge-miner'),
  projectName: z.string().min(3).default('Cancer Knowledge Miner'),
  projectDescription: z
    .string()
    .default('Processes open-access oncology and biomedical literature into structured, citation-backed facts.')
});

export async function POST(request: Request) {
  const rateLimit = checkNamedRateLimit(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const options = parsed.data;
  const run = await withDb((db) =>
    startIngestionRun(db, {
      sourceType: 'pubmed_abstract',
      mode: 'manual',
      query: options.query,
      retmax: options.retmax,
      usedNcbiEmail: Boolean(process.env.NCBI_EMAIL),
      usedNcbiApiKey: Boolean(process.env.NCBI_API_KEY)
    })
  );

  try {
    const records = await fetchPubMedRecords({
    query: options.query,
    retmax: options.retmax,
    email: process.env.NCBI_EMAIL,
    apiKey: process.env.NCBI_API_KEY
    });

    const sources = records.map((record) => ({
    title: record.title,
    sourceText: record.abstractText,
    sourceCitation: record.sourceCitation,
    sourceUrl: record.sourceUrl,
    sourcePublishedAt: record.sourcePublishedAt
  }));

    const output = await withDb((db) => {
    const project = getOrCreateProject(db, {
      slug: options.projectSlug,
      name: options.projectName,
      description: options.projectDescription
    });

    const packetSummary = createWorkPacketsFromSources(db, {
      projectId: project.id,
      sources,
      extractor: 'local-llm-v1'
    });

      const completedRun = completeIngestionRun(db, run.id, {
        fetchedCount: records.length,
        skippedCount: Math.max(options.retmax - records.length, 0),
        failedCount: 0,
        failureReasons: [],
        packetsCreated: packetSummary.packetsCreated,
        packetsSkipped: packetSummary.packetsSkipped,
        status: 'completed'
      });

      return {
      project,
      fetched: records.length,
      ...packetSummary,
      run: completedRun
    };
    });

    return NextResponse.json({ ingest: output });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'pubmed_ingest_failed';
    const failedRun = await withDb((db) =>
      completeIngestionRun(db, run.id, {
        status: 'failed',
        failedCount: 1,
        failureReasons: [reason]
      })
    );
    return NextResponse.json({ error: reason, run: failedRun }, { status: 502 });
  }
}

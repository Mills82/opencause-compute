import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../../../lib/db';
import { createWorkPacketsFromSources, getOrCreateProject } from '../../../../../lib/coordinator';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { ingestPmcOaFullText } from '../../../../../lib/ingestion/pmc-oa';

const requestSchema = z.object({
  query: z.string().min(3),
  retmax: z.number().int().min(1).max(50).default(10),
  projectSlug: z.string().min(3).default('cancer-knowledge-miner'),
  projectName: z.string().min(3).default('Cancer Knowledge Miner'),
  projectDescription: z
    .string()
    .default('Processes open-access oncology and biomedical literature into structured, citation-backed facts.')
});

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const options = parsed.data;
  const sources = await ingestPmcOaFullText({
    query: options.query,
    retmax: options.retmax,
    email: process.env.NCBI_EMAIL,
    apiKey: process.env.NCBI_API_KEY
  });

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

    return {
      project,
      fetchedChunks: sources.length,
      ...packetSummary
    };
  });

  return NextResponse.json({ ingest: output });
}

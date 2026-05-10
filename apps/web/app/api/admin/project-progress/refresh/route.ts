import { NextResponse } from 'next/server';
import { isAdminAuthorized, isCronAuthorized } from '../../../../../lib/admin-auth';
import { withDb, loadDb } from '../../../../../lib/db';
import { getOrCreateProject } from '../../../../../lib/coordinator';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../lib/rate-limit';
import { upsertProjectCorpusEstimateRelational } from '../../../../../lib/relational-app';
import { buildPmcCorpusEstimateInput, CKM_PROJECT_SLUG, DEFAULT_CKM_QUERY, upsertProjectCorpusEstimate } from '../../../../../lib/project-progress/refresh';

const PROJECT_NAME = 'Cancer Knowledge Miner';
const PROJECT_DESCRIPTION = 'Processes open-access oncology and biomedical literature into structured, citation-backed facts.';

function queryFromEnv() {
  return process.env.CKM_CORPUS_QUERY ?? DEFAULT_CKM_QUERY;
}

async function refreshProjectProgress() {
  const query = queryFromEnv();
  const db = await loadDb();
  const project = db.projects.find((candidate) => candidate.slug === CKM_PROJECT_SLUG) ?? await withDb((state) => getOrCreateProject(state, { slug: CKM_PROJECT_SLUG, name: PROJECT_NAME, description: PROJECT_DESCRIPTION }));
  const input = await buildPmcCorpusEstimateInput({ query, db, email: process.env.NCBI_EMAIL, apiKey: process.env.NCBI_API_KEY });
  const relational = await upsertProjectCorpusEstimateRelational({ projectId: project.id, ...input, refreshStatus: 'success', failureReason: null });
  const estimate = relational ?? await withDb((state) => upsertProjectCorpusEstimate(state, { projectId: project.id, ...input, refreshStatus: 'success', failureReason: null }));
  return { project, estimate };
}

export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, progress: await refreshProjectProgress() });
}

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request) && !isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, progress: await refreshProjectProgress() });
}

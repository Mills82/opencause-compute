import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../../lib/admin-auth';
import { previewPmcOaFullText } from '../../../../../../lib/ingestion/pmc-oa';
import { getIngestionCursor } from '../../../../../../lib/ingestion/cursors';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../../../lib/rate-limit';

const bodySchema = z.object({
  query: z.string().min(3).default('(cancer OR carcinoma OR melanoma OR leukemia OR lymphoma) AND (survival OR response OR resistance OR prognosis OR biomarker OR toxicity OR recurrence OR radiotherapy OR immunotherapy) AND open access[filter]'),
  retmax: z.number().int().min(1).max(10).default(3),
  retstart: z.number().int().min(0).optional(),
  maxPacketsPerArticle: z.number().int().min(1).max(10).default(5),
  maxPacketsPerSection: z.number().int().min(1).max(5).default(2)
});

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'ingest');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 });
  const options = parsed.data;
  const cursor = await getIngestionCursor('pmc_oa_full_text', options.query);
  const retstart = options.retstart ?? cursor?.nextRetstart ?? 0;
  const preview = await previewPmcOaFullText({ ...options, retstart, email: process.env.NCBI_EMAIL, apiKey: process.env.NCBI_API_KEY });
  return NextResponse.json({ ok: true, mode: 'preview', retstart, ...preview, sources: preview.sources.slice(0, 10) });
}

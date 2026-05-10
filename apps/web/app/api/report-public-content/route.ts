import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../lib/db';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';
import { createPublicReport } from '../../../lib/gamification/moderation';
import { createPublicReportRelational } from '../../../lib/relational-app';

const schema = z.object({ targetType: z.enum(['volunteer_profile', 'team', 'impact_card']), targetSlug: z.string().optional(), reason: z.string().min(3).max(80), details: z.string().max(1000).optional(), reporterContact: z.string().max(200).optional() });

export async function POST(request: Request) {
  const limit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const report = (await createPublicReportRelational(parsed.data)) ?? await withDb((db) => createPublicReport(db, parsed.data));
  return NextResponse.json({ report: { id: report.id, status: report.status, createdAt: report.createdAt } });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../lib/db';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';
import { createPublicReport } from '../../../lib/gamification/moderation';
import { createPublicReportRelational } from '../../../lib/relational-app';
import { clientIp, verifyTurnstile } from '../../../lib/turnstile';
import { isHostedMode } from '../../../lib/runtime-config';

const schema = z.object({
  targetType: z.enum(['volunteer_profile', 'team', 'impact_card']),
  targetSlug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  reason: z.string().trim().min(3).max(80),
  details: z.string().trim().max(1000).optional(),
  reporterContact: z.string().trim().max(200).optional(),
  turnstileToken: z.string().optional()
});

function genericResponse(status = 202) {
  return NextResponse.json({ ok: true, status: 'received' }, { status });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_report' }, { status: 400 });

  const ip = clientIp(request) ?? 'unknown';
  const limit = await checkNamedRateLimitAsync(request, 'publicReport', ip);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  if (isHostedMode() || process.env.NODE_ENV === 'production') {
    const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, ip);
    if (!turnstileOk) return NextResponse.json({ error: 'verification_required' }, { status: 400 });
  }

  const input = {
    targetType: parsed.data.targetType,
    targetSlug: parsed.data.targetSlug,
    reason: parsed.data.reason,
    details: parsed.data.details ?? '',
    reporterContact: parsed.data.reporterContact || undefined
  };

  try {
    const report = (await createPublicReportRelational(input)) ?? await withDb((db) => createPublicReport(db, input));
    return NextResponse.json({ ok: true, status: 'received', report: { id: report.id, status: report.status, createdAt: report.createdAt } }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'report_failed';
    if (message === 'target_not_found' || message === 'duplicate_report') return genericResponse();
    throw error;
  }
}

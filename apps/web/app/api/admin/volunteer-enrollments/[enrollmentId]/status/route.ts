import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../../lib/admin-auth';
import { recordAuditEvent } from '../../../../../../lib/audit';
import { withDb } from '../../../../../../lib/db';
import { checkNamedRateLimit, rateLimitResponse } from '../../../../../../lib/rate-limit';

const requestSchema = z.object({ status: z.enum(['issued', 'revoked']) });

export async function POST(request: Request, { params }: { params: { enrollmentId: string } }) {
  const rateLimit = checkNamedRateLimit(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const enrollment = await withDb((db) => {
    const existing = db.volunteerEnrollments.find((candidate) => candidate.id === params.enrollmentId);
    if (!existing) throw new Error('enrollment_not_found');
    if (existing.status === 'used') throw new Error('enrollment_already_used');
    existing.status = parsed.data.status;
    recordAuditEvent(db, {
      actorType: 'admin',
      action: 'volunteer_enrollment.status.updated',
      targetType: 'volunteer_enrollment',
      targetId: existing.id,
      metadata: { status: existing.status, email: existing.email }
    });
    return existing;
  }).catch((error: unknown) => {
    if (error instanceof Error) return error;
    throw error;
  });

  if (enrollment instanceof Error) {
    const status = enrollment.message === 'enrollment_not_found' ? 404 : 409;
    return NextResponse.json({ error: enrollment.message }, { status });
  }

  return NextResponse.json({ enrollment: { ...enrollment, enrollmentCodeHash: undefined } });
}

import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDb } from '../../../../lib/db';
import { recordAuditEvent } from '../../../../lib/audit';
import { hashEnrollmentCode } from '../../../../lib/coordinator';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';
import { clientIp, verifyTurnstile } from '../../../../lib/turnstile';
import { enrollmentEmail, enrollmentEmailConfigured, sendEmail } from '../../../../lib/email';

const requestSchema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional()
});

function publicEnrollmentEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
}

function isHostedOrProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.OPENCAUSE_HOSTED === 'true';
}

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'nodeRegister');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  if (!publicEnrollmentEnabled()) {
    return NextResponse.json({ error: 'public_enrollment_disabled' }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (isHostedOrProduction() && !enrollmentEmailConfigured()) {
    return NextResponse.json({ error: 'enrollment_email_not_configured' }, { status: 503 });
  }

  const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, clientIp(request));
  if (!turnstileOk) {
    return NextResponse.json({ error: 'challenge_failed' }, { status: 403 });
  }

  const email = parsed.data.email.toLowerCase();
  const enrollmentCode = `occ_${randomBytes(24).toString('base64url')}`;
  const enrollmentCodeHash = hashEnrollmentCode(enrollmentCode);
  const now = new Date().toISOString();

  const enrollment = await withDb((db) => {
    const recentIssued = db.volunteerEnrollments.filter(
      (candidate) => candidate.email === email && candidate.status === 'issued'
    );
    if (recentIssued.length >= 3) throw new Error('too_many_open_enrollments');

    const record = {
      id: randomUUID(),
      email,
      enrollmentCodeHash,
      status: 'issued' as const,
      createdAt: now,
      usedAt: null,
      nodeId: null,
      source: 'public_signup' as const
    };
    db.volunteerEnrollments.unshift(record);
    recordAuditEvent(db, {
      actorType: 'system',
      action: 'volunteer_enrollment.issued',
      targetType: 'volunteer_enrollment',
      targetId: record.id,
      metadata: { email }
    });
    return record;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'too_many_open_enrollments') return null;
    throw error;
  });

  if (!enrollment) {
    return NextResponse.json({ error: 'too_many_open_enrollments' }, { status: 429 });
  }

  const emailResult = await sendEmail({
    to: email,
    ...enrollmentEmail(enrollmentCode)
  });

  const showCode = !isHostedOrProduction() && (process.env.SHOW_ENROLLMENT_CODE_IN_BROWSER === 'true' || !emailResult.sent);

  await withDb((db) => {
    recordAuditEvent(db, {
      actorType: 'system',
      action: 'volunteer_enrollment.delivery',
      targetType: 'volunteer_enrollment',
      targetId: enrollment.id,
      metadata: { email, delivery: emailResult, shownInBrowser: showCode }
    });
  });

  return NextResponse.json({
    enrollment: {
      id: enrollment.id,
      email: enrollment.email,
      status: enrollment.status,
      createdAt: enrollment.createdAt
    },
    delivery: emailResult,
    ...(showCode ? { enrollmentCode } : {}),
    instructions: showCode
      ? 'Use this one-time code as NODE_ENROLLMENT_CODE or pass --enrollment-code when registering the worker.'
      : 'Check your email for the one-time worker enrollment code.'
  });
}

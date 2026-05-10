import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isNodeEnrollmentRequired, registerNode } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { registerNodeRelational } from '../../../../lib/relational-app';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';

const requestSchema = z.object({
  nodeName: z.string().min(1),
  platform: z.string().min(1),
  version: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  enrollmentCode: z.string().optional()
});

export async function POST(request: Request) {
  const limit = await checkNamedRateLimitAsync(request, 'nodeRegister');
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const relationalRegistration = await registerNodeRelational(parsed.data);
    const registration = relationalRegistration ?? await withDb((db) => registerNode(db, parsed.data));
    return NextResponse.json(registration);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'registration_failed';
    if (message === 'invalid_enrollment_code' || message === 'enrollment_not_configured') {
      return NextResponse.json(
        {
          error: message,
          message: isNodeEnrollmentRequired()
            ? 'A valid private-alpha enrollment code is required to register this worker.'
            : 'Worker enrollment is not configured for this hosted deployment.'
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

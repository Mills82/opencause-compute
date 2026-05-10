import { NextResponse } from 'next/server';
import { z } from 'zod';
import { failClaim } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { extractNodeToken, isNodeAuthorized } from '../../../../lib/node-auth';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';
import { failClaimRelational } from '../../../../lib/relational-worker';

const requestSchema = z.object({
  nodeId: z.string().min(1),
  claimId: z.string().min(1),
  workPacketId: z.string().min(1),
  reason: z.string().min(1).max(500)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const limit = await checkNamedRateLimitAsync(request, 'workSubmit', parsed.data.nodeId);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const token = extractNodeToken(request);
    const relationalOutput = await failClaimRelational({ ...parsed.data, token });
    const output = relationalOutput !== undefined ? relationalOutput : await withDb((db) => {
      if (!isNodeAuthorized(db, parsed.data.nodeId, token)) throw new Error('node_unauthorized');
      return failClaim(db, parsed.data);
    });
    return NextResponse.json(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'claim_fail_report_failed';
    if (message === 'node_revoked' || message === 'node_suspended') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: message === 'node_unauthorized' ? 401 : 400 });
  }
}

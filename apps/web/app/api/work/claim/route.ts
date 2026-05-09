import { NextResponse } from 'next/server';
import { z } from 'zod';
import { claimWork } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { extractNodeToken, isNodeAuthorized } from '../../../../lib/node-auth';
import { checkRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';

const requestSchema = z.object({
  nodeId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limit = checkRateLimit(request, 'work-claim', { limit: 30, windowMs: 60_000, identity: parsed.data.nodeId });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const token = extractNodeToken(request);
    const claim = await withDb((db) => {
      if (!isNodeAuthorized(db, parsed.data.nodeId, token)) throw new Error('node_unauthorized');
      return claimWork(db, parsed.data.nodeId);
    });
    if (!claim) {
      return NextResponse.json({ claim: null, message: 'no_work_available' });
    }
    return NextResponse.json(claim);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'claim_failed';
    if (message === 'node_unauthorized') {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message === 'node_not_found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'node_revoked' || message === 'node_suspended') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === 'node_offline') {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

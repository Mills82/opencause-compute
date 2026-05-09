import { NextResponse } from 'next/server';
import { z } from 'zod';
import { heartbeatNode } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { extractNodeToken, isNodeAuthorized } from '../../../../lib/node-auth';
import { checkNamedRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';

const requestSchema = z.object({
  nodeId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limit = checkNamedRateLimit(request, 'nodeHeartbeat', parsed.data.nodeId);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const token = extractNodeToken(request);
    const node = await withDb((db) => {
      if (!isNodeAuthorized(db, parsed.data.nodeId, token)) throw new Error('node_unauthorized');
      return heartbeatNode(db, parsed.data.nodeId);
    });
    return NextResponse.json({ node });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'node_not_found';
    if (message === 'node_unauthorized') return NextResponse.json({ error: 'node_unauthorized' }, { status: 401 });
    if (message === 'node_revoked' || message === 'node_suspended') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: 'node_not_found' }, { status: 404 });
  }
}

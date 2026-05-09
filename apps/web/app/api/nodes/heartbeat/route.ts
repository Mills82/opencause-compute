import { NextResponse } from 'next/server';
import { z } from 'zod';
import { heartbeatNode } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { extractNodeToken, isNodeAuthorized } from '../../../../lib/node-auth';

const requestSchema = z.object({
  nodeId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'node_not_found' }, { status: 404 });
  }
}

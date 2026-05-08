import { NextResponse } from 'next/server';
import { z } from 'zod';
import { heartbeatNode } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';

const requestSchema = z.object({
  nodeId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const node = await withDb((db) => heartbeatNode(db, parsed.data.nodeId));
    return NextResponse.json({ node });
  } catch {
    return NextResponse.json({ error: 'node_not_found' }, { status: 404 });
  }
}

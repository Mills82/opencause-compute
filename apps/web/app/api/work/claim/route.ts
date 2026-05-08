import { NextResponse } from 'next/server';
import { z } from 'zod';
import { claimWork } from '../../../../lib/coordinator';
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
    const claim = await withDb((db) => claimWork(db, parsed.data.nodeId));
    if (!claim) {
      return NextResponse.json({ claim: null, message: 'no_work_available' });
    }
    return NextResponse.json(claim);
  } catch {
    return NextResponse.json({ error: 'node_not_found' }, { status: 404 });
  }
}

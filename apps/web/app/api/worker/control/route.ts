import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkerControl, updateWorkerControl } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { isAdminAuthorized } from '../../../../lib/admin-auth';

const updateSchema = z.object({
  paused: z.boolean().optional(),
  idleMode: z.enum(['user-and-cpu', 'cpu-only']).optional(),
  minIdleSeconds: z.number().int().min(0).optional(),
  maxCpuPercent: z.number().min(1).max(100).optional()
});

export async function GET() {
  const config = await withDb((db) => getWorkerControl(db));
  return NextResponse.json({ config });
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await withDb((db) => updateWorkerControl(db, parsed.data));
  return NextResponse.json({ config });
}

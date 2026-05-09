import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../../lib/admin-auth';
import { withDb } from '../../../../../lib/db';
import { recomputeGamification } from '../../../../../lib/gamification/recompute';

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const summary = await withDb((db) => recomputeGamification(db));
  return NextResponse.json(summary);
}

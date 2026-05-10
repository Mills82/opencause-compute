import { NextResponse } from 'next/server';
import { isAdminAuthorized, isCronAuthorized } from '../../../../../lib/admin-auth';
import { withDb } from '../../../../../lib/db';
import { recomputeGamification } from '../../../../../lib/gamification/recompute';

async function runRecompute() {
  const summary = await withDb((db) => recomputeGamification(db));
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request) && !isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return runRecompute();
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return runRecompute();
}

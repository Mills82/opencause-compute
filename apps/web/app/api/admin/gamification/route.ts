import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { loadDb } from '../../../../lib/db';
import { listGamificationAdmin } from '../../../../lib/gamification/admin';

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(listGamificationAdmin(await loadDb()));
}

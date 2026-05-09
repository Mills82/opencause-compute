import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { loadDb } from '../../../../lib/db';

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = await loadDb();
  return NextResponse.json({ ingestionRuns: db.ingestionRuns.slice(0, 50) });
}

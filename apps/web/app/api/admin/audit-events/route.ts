import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { loadDb } from '../../../../lib/db';
import { recentAuditEvents } from '../../../../lib/audit';

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = await loadDb();
  return NextResponse.json({ auditEvents: recentAuditEvents(db, 100) });
}

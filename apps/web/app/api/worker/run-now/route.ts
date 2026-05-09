import { NextResponse } from 'next/server';
import { triggerRunNow } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';
import { isAdminAuthorized } from '../../../../lib/admin-auth';

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const config = await withDb((db) => triggerRunNow(db));
  return NextResponse.json({ config });
}

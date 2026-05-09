export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withDb } from '../../../lib/db';
import { listResults } from '../../../lib/coordinator';

export async function GET() {
  const results = await withDb((db) => listResults(db));
  return NextResponse.json({ results });
}

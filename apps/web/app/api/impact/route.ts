import { NextResponse } from 'next/server';
import { loadDb } from '../../../lib/db';
import { buildImpactSummary } from '../../../lib/gamification/public';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json(buildImpactSummary(db));
}

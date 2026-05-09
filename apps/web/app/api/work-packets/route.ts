export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withDb } from '../../../lib/db';
import { listWorkPackets } from '../../../lib/coordinator';

export async function GET() {
  const workPackets = await withDb((db) => listWorkPackets(db));
  return NextResponse.json({ workPackets });
}

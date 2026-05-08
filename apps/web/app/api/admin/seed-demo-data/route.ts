import { NextResponse } from 'next/server';
import { withDb } from '../../../../lib/db';
import { seedDemoData } from '../../../../lib/coordinator';

export async function POST() {
  const seeded = await withDb((db) => seedDemoData(db));
  return NextResponse.json({ seeded });
}

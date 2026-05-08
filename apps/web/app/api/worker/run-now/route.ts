import { NextResponse } from 'next/server';
import { triggerRunNow } from '../../../../lib/coordinator';
import { withDb } from '../../../../lib/db';

export async function POST() {
  const config = await withDb((db) => triggerRunNow(db));
  return NextResponse.json({ config });
}

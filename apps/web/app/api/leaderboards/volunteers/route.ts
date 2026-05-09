import { NextResponse } from 'next/server';
import { loadDb } from '../../../../lib/db';
import { buildVolunteerLeaderboard } from '../../../../lib/gamification/public';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({ entries: buildVolunteerLeaderboard(db), privacy: 'Only volunteers who opt into public recognition appear here. Private profiles are excluded.' });
}

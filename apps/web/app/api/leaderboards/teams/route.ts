import { NextResponse } from 'next/server';
import { loadDb } from '../../../../lib/db';
import { buildTeamLeaderboard } from '../../../../lib/gamification/public';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({ entries: buildTeamLeaderboard(db), privacy: 'Only public teams appear here.' });
}

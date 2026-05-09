import { NextResponse } from 'next/server';
import { loadDb } from '../../../../lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const team = db.teams.find((candidate) => candidate.slug === slug && candidate.visibility === 'public' && candidate.moderationStatus !== 'hidden');
  if (!team) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const stats = db.teamStatsSnapshots.find((snapshot) => snapshot.teamId === team.id && snapshot.window === 'all_time');
  return NextResponse.json({ name: team.name, slug: team.slug, description: team.description, createdAt: team.createdAt, stats: stats ?? null });
}

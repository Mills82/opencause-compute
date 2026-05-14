import { NextResponse } from 'next/server';
import { loadDb } from '../../../lib/db';
import { listEvidenceCards } from '../../../lib/evidence-cards';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') ?? 100)));
  const db = await loadDb();
  return NextResponse.json({ schemaVersion: 'evidence-cards-v1', cards: listEvidenceCards(db, limit) });
}

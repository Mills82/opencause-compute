import { NextResponse } from 'next/server';
import { loadDb } from '../../../../../lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const card = db.impactCards.find((candidate) => candidate.slug === slug && candidate.publicEnabled && candidate.moderationStatus !== 'hidden');
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    slug: card.slug,
    cardType: card.cardType,
    title: card.title,
    subtitle: card.subtitle,
    metricLabel: card.metricLabel,
    metricValue: card.metricValue,
    accentColor: card.accentColor,
    periodStart: card.periodStart,
    periodEnd: card.periodEnd,
    disclaimer: 'OpenCause impact metrics describe candidate extraction and validation work, not medical conclusions or clinical findings.'
  });
}

export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { loadDb } from '../../../../lib/db';

export default async function ImpactCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const card = db.impactCards.find((candidate) => candidate.slug === slug && candidate.publicEnabled && candidate.moderationStatus !== 'hidden');
  if (!card) notFound();
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Shareable impact card</p>
        <h1 className="text-4xl font-semibold tracking-tight">OpenCause contribution, safe to share.</h1>
        <p className="text-slate-300">This public recognition card highlights contribution without exposing private node IDs, enrollment codes, emails, or raw submissions.</p>
      </div>
      <article className="overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl">
        <div className="h-3" style={{ backgroundColor: card.accentColor }} />
        <div className="space-y-6 p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em]" style={{ color: card.accentColor }}>OpenCause Compute</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">{card.title}</h2>
          </div>
          <div className="rounded-2xl border border-line/70 bg-ink p-6">
            <p className="text-sm text-slate-300">{card.metricLabel}</p>
            <p className="mt-2 text-6xl font-semibold" style={{ color: card.accentColor }}>{card.metricValue}</p>
          </div>
          <p className="text-lg text-slate-300">{card.subtitle}</p>
          <p className="text-xs text-slate-400">Open-science processing, validation, and consensus activity — not medical conclusions or clinical findings.</p>
        </div>
      </article>
      <a className="text-sm text-slate-400 underline" href={`/report-public-content?targetType=impact_card&targetSlug=${card.slug}`}>Report this card</a>
    </section>
  );
}

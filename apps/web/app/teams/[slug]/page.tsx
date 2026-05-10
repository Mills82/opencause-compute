import { notFound } from 'next/navigation';
import { loadDb } from '../../../lib/db';

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line bg-panel p-5"><p className="text-3xl font-semibold text-white">{value.toLocaleString()}</p><p className="mt-2 text-sm text-slate-300">{label}</p></div>;
}

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const team = db.teams.find((candidate) => candidate.slug === slug && candidate.visibility === 'public' && candidate.moderationStatus !== 'hidden');
  if (!team) notFound();
  const stats = db.teamStatsSnapshots.find((snapshot) => snapshot.teamId === team.id && snapshot.window === 'all_time');
  const members = db.teamMemberships.filter((membership) => membership.teamId === team.id && membership.status === 'active');
  const cards = db.impactCards.filter((card) => card.teamId === team.id && card.publicEnabled && card.moderationStatus !== 'hidden');

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Team profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{team.name}</h1>
        {team.description ? <p className="mt-3 max-w-3xl text-slate-300">{team.description}</p> : <p className="mt-3 max-w-3xl text-slate-300">A public OpenCause team contributing volunteer compute to open science.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Members" value={stats?.memberCount ?? members.length} />
        <Stat label="Contribution score" value={stats?.contributionScore ?? 0} />
        <Stat label="Structure-validated submissions" value={stats?.formatValidatedSubmissions ?? 0} />
        <Stat label="Consensus-passed evidence candidates" value={stats?.consensusPassedContributions ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Team impact</h2>
          <p className="mt-2 text-slate-300">Team metrics aggregate eligible open-science contributions: processing, validation, and consensus activity. They are not medical conclusions.</p>
          {cards.length ? <div className="mt-4 flex flex-wrap gap-2">{cards.map((card) => <a key={card.slug} className="rounded border border-line px-3 py-2 text-sm hover:border-accent hover:no-underline" href={`/impact/cards/${card.slug}`}>Share card</a>)}</div> : null}
        </div>

        <div className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Members</h2>
          {members.length ? <p className="mt-2 text-sm text-slate-300">{members.length.toLocaleString()} active member{members.length === 1 ? '' : 's'}.</p> : <p className="mt-2 text-sm text-slate-300">Members will appear after volunteers join this team.</p>}
        </div>
      </div>

      <a className="text-sm text-slate-400 underline" href={`/report-public-content?targetType=team&targetSlug=${team.slug}`}>Report this team</a>
    </section>
  );
}

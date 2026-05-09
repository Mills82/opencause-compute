import { notFound } from 'next/navigation';
import { loadDb } from '../../../lib/db';

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await loadDb();
  const team = db.teams.find((candidate) => candidate.slug === slug && candidate.visibility === 'public');
  if (!team) notFound();
  const stats = db.teamStatsSnapshots.find((snapshot) => snapshot.teamId === team.id && snapshot.window === 'all_time');
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Team profile</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{team.name}</h1>
        {team.description ? <p className="mt-3 text-slate-300">{team.description}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.memberCount ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Members</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.contributionScore ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Contribution score</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.formatValidatedSubmissions ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Format-validated submissions</p></div>
        <div className="rounded-xl border border-line bg-panel p-5"><p className="text-2xl font-semibold">{(stats?.consensusPassedContributions ?? 0).toLocaleString()}</p><p className="text-sm text-slate-300">Consensus-passed candidate facts</p></div>
      </div>
      <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">Team metrics aggregate eligible member contributions. These metrics are candidate extraction and validation work, not medical conclusions.</p>
    </section>
  );
}

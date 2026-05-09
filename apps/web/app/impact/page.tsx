import { loadDb } from '../../lib/db';
import { buildImpactSummary, buildTeamLeaderboard } from '../../lib/gamification/public';

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <p className="text-3xl font-semibold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="mt-2 text-sm text-slate-300">{label}</p>
    </div>
  );
}

export default async function ImpactPage() {
  const db = await loadDb();
  const impact = buildImpactSummary(db);
  const topTeams = buildTeamLeaderboard(db).slice(0, 3);
  const hasWork = impact.sectionsProcessed > 0 || impact.formatValidatedSubmissions > 0;

  return (
    <section className="space-y-8">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Impact dashboard</p>
        <h1 className="text-4xl font-semibold tracking-tight">Volunteer compute, measured carefully.</h1>
        <p className="text-lg text-slate-300">
          OpenCause Compute turns idle computers into structured help for open science. These numbers represent candidate extraction and validation work, not medical conclusions.
        </p>
        {!hasWork ? (
          <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
            OpenCause Compute is preparing its first volunteer compute runs. Once work begins, this page will show aggregate processing activity, format-validated submissions, and consensus-passed candidate facts.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Volunteer profiles" value={impact.volunteers} />
        <Metric label="Active nodes" value={impact.activeNodes} />
        <Metric label="Public teams" value={impact.teams} />
        <Metric label="Paper sections processed" value={impact.sectionsProcessed} />
        <Metric label="Format-validated submissions" value={impact.formatValidatedSubmissions} />
        <Metric label="Consensus-passed candidate facts" value={impact.consensusPassedContributions} />
      </div>

      <div className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-xl font-semibold">Current project</h2>
        <p className="mt-2 text-slate-300">{impact.currentProject}: citation-backed candidate fact extraction from public/open biomedical literature.</p>
      </div>

      <div className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-xl font-semibold">Top teams</h2>
        {topTeams.length ? (
          <ol className="mt-4 space-y-3 text-sm text-slate-300">
            {topTeams.map((team) => <li key={team.slug}>#{team.rank} {team.name} — {team.contributionScore.toLocaleString()} contribution score</li>)}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-300">Team impact will appear after teams are created and complete eligible contributions.</p>
        )}
      </div>
    </section>
  );
}

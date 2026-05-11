export const dynamic = 'force-dynamic';

import { loadDb } from '../../lib/db';
import { buildImpactSummary, buildTeamLeaderboard, buildVolunteerLeaderboard } from '../../lib/gamification/public';

export default async function LeaderboardsPage() {
  const db = await loadDb();
  const impact = buildImpactSummary(db);
  const volunteers = buildVolunteerLeaderboard(db).slice(0, 3);
  const teams = buildTeamLeaderboard(db).slice(0, 3);
  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Leaderboards</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Recognition for reliable open-science contribution.</h1>
          <p className="text-lg text-slate-300">
            Scores recognize useful evidence work that passes validation and consensus checks. Runtime is capped so recognition favors quality and reliability, not simply leaving a machine on.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5"><p className="text-3xl font-semibold text-white">{impact.publicVolunteers.toLocaleString()}</p><p className="mt-2 text-sm text-slate-300">Public volunteers</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><p className="text-3xl font-semibold text-white">{impact.formatValidatedSubmissions.toLocaleString()}</p><p className="mt-2 text-sm text-slate-300">Structure-validated submissions</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><p className="text-3xl font-semibold text-white">{impact.teams.toLocaleString()}</p><p className="mt-2 text-sm text-slate-300">Public teams</p></article>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a className="rounded-xl border border-line bg-panel p-5 hover:border-accent hover:no-underline" href="/leaderboards/volunteers">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Volunteers</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Volunteer recognition</h2>
          <p className="mt-2 text-sm text-slate-300">Opt-in public volunteer recognition with private profiles excluded.</p>
          <p className="mt-4 text-sm text-slate-400">{volunteers.length ? `${volunteers.length} top volunteer preview${volunteers.length === 1 ? '' : 's'}` : 'No public volunteers yet'}</p>
        </a>
        <a className="rounded-xl border border-line bg-panel p-5 hover:border-accent hover:no-underline" href="/leaderboards/teams">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Teams</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Team recognition</h2>
          <p className="mt-2 text-sm text-slate-300">Public team totals for schools, communities, companies, families, and research supporters.</p>
          <p className="mt-4 text-sm text-slate-400">{teams.length ? `${teams.length} top team preview${teams.length === 1 ? '' : 's'}` : 'No public teams yet'}</p>
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Top volunteers</h2>
          {volunteers.length ? <ol className="mt-4 space-y-3 text-sm text-slate-300">{volunteers.map((entry) => <li key={entry.rank} className="flex justify-between gap-4"><span>#{entry.rank} {entry.displayName}</span><span>{entry.contributionScore.toLocaleString()}</span></li>)}</ol> : <p className="mt-2 text-sm text-slate-300">Volunteer rankings will appear after public opt-in and eligible contributions.</p>}
        </article>
        <article className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Top teams</h2>
          {teams.length ? <ol className="mt-4 space-y-3 text-sm text-slate-300">{teams.map((entry) => <li key={entry.rank} className="flex justify-between gap-4"><span>#{entry.rank} {entry.name}</span><span>{entry.contributionScore.toLocaleString()}</span></li>)}</ol> : <p className="mt-2 text-sm text-slate-300">Teams are coming soon. This section will open once public teams begin completing eligible contributions.</p>}
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="font-semibold text-white">How scoring works</h2>
          <p className="mt-2">Scores reward structure-validated submissions, consensus-passed contributions, active contribution days, and accepted review outcomes. Rejected or unreliable submissions reduce score.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="font-semibold text-white">Privacy first</h2>
          <p className="mt-2">Private profiles are excluded. Volunteers choose whether to appear publicly, anonymously, or not at all.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="font-semibold text-white">What rankings mean</h2>
          <p className="mt-2">Leaderboards report open-science processing, validation, and consensus activity. They do not indicate scientific acceptance, clinical findings, or medical advice.</p>
        </article>
      </div>
    </section>
  );
}

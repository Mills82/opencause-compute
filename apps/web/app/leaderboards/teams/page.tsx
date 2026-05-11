export const dynamic = 'force-dynamic';

import { loadDb } from '../../../lib/db';
import { buildTeamLeaderboard } from '../../../lib/gamification/public';

export default async function TeamLeaderboardPage() {
  const entries = buildTeamLeaderboard(await loadDb());
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Team leaderboard</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Team contribution to open science.</h1>
        <p className="text-slate-300">Only public teams appear here. Team scores aggregate eligible member contributions that pass validation and consensus checks.</p>
      </div>
      {entries.length ? (
        <div className="mobile-card-list table-scroll rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate-300"><tr><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3">Members</th><th className="p-3">Score</th><th className="p-3">Consensus-passed</th><th className="p-3">Structure-validated</th><th className="p-3">Active days</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.slug} className="border-b border-line/60"><td className="p-3" data-label="Rank">#{entry.rank}</td><td className="p-3" data-label="Team"><a className="text-accent" href={`/teams/${entry.slug}`}>{entry.name}</a></td><td className="p-3" data-label="Members">{entry.memberCount.toLocaleString()}</td><td className="p-3" data-label="Score">{entry.contributionScore.toLocaleString()}</td><td className="p-3" data-label="Consensus-passed">{entry.consensusPassedContributions.toLocaleString()}</td><td className="p-3" data-label="Structure-validated">{entry.formatValidatedSubmissions.toLocaleString()}</td><td className="p-3" data-label="Active days">{entry.activeDays.toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Coming soon</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Public team recognition will open as beta participation grows.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Teams are intended for schools, labs, community groups, companies, families, and research supporters who want to contribute together. This leaderboard will appear once public teams begin completing eligible validated work.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-line/70 bg-ink p-4 text-sm text-slate-300"><h3 className="font-semibold text-white">Opt-in visibility</h3><p className="mt-2">Only public teams appear here.</p></article>
            <article className="rounded-xl border border-line/70 bg-ink p-4 text-sm text-slate-300"><h3 className="font-semibold text-white">Quality-weighted</h3><p className="mt-2">Scores emphasize validated and consensus-aligned contributions.</p></article>
            <article className="rounded-xl border border-line/70 bg-ink p-4 text-sm text-slate-300"><h3 className="font-semibold text-white">Research-support only</h3><p className="mt-2">Team activity is not scientific or clinical endorsement.</p></article>
          </div>
        </div>
      )}
    </section>
  );
}

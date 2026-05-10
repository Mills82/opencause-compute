export const dynamic = 'force-dynamic';

import { loadDb } from '../../../lib/db';
import { buildVolunteerLeaderboard } from '../../../lib/gamification/public';

export default async function VolunteerLeaderboardPage() {
  const entries = buildVolunteerLeaderboard(await loadDb());
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Volunteer leaderboard</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Opt-in volunteer recognition.</h1>
        <p className="text-slate-300">Private profiles are excluded. Anonymous public volunteers appear without profile links. Scores emphasize validated contribution, not raw runtime.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">Quality-weighted</h2><p className="mt-2">Recognition emphasizes validated and consensus-aligned work, not raw runtime.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">Opt-in visibility</h2><p className="mt-2">Private profiles are excluded. Anonymous public profiles can contribute without a public name.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">Research-support only</h2><p className="mt-2">Leaderboard activity reflects processing and validation progress, not clinical or scientific acceptance.</p></article>
      </div>

      <div className="mobile-card-list table-scroll rounded-xl border border-line bg-panel">
        {entries.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate-300"><tr><th className="p-3">Rank</th><th className="p-3">Volunteer</th><th className="p-3">Team</th><th className="p-3">Score</th><th className="p-3">Consensus-passed</th><th className="p-3">Structure-validated</th><th className="p-3">Active days</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={`${entry.rank}-${entry.displayName}`} className="border-b border-line/60"><td className="p-3" data-label="Rank">#{entry.rank}</td><td className="p-3" data-label="Volunteer">{entry.slug ? <a className="text-accent" href={`/volunteers/${entry.slug}`}>{entry.displayName}</a> : entry.displayName}</td><td className="p-3" data-label="Team">{entry.team ? <a className="text-accent" href={`/teams/${entry.team.slug}`}>{entry.team.name}</a> : '—'}</td><td className="p-3" data-label="Score">{entry.contributionScore.toLocaleString()}</td><td className="p-3" data-label="Consensus-passed">{entry.consensusPassedContributions.toLocaleString()}</td><td className="p-3" data-label="Structure-validated">{entry.formatValidatedSubmissions.toLocaleString()}</td><td className="p-3" data-label="Active days">{entry.activeDays.toLocaleString()}</td></tr>)}</tbody>
          </table>
        ) : <p className="p-5 text-sm text-slate-300">Volunteer rankings will appear after volunteers opt into public recognition and complete eligible contributions.</p>}
      </div>
    </section>
  );
}

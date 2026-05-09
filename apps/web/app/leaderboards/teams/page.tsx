import { loadDb } from '../../../lib/db';
import { buildTeamLeaderboard } from '../../../lib/gamification/public';

export default async function TeamLeaderboardPage() {
  const entries = buildTeamLeaderboard(await loadDb());
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Team leaderboard</p>
        <h1 className="text-4xl font-semibold tracking-tight">Community impact, grouped safely.</h1>
        <p className="text-slate-300">Only public teams appear here. Team scores aggregate eligible member contribution.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {entries.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate-300"><tr><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3">Members</th><th className="p-3">Score</th><th className="p-3">Consensus-passed</th><th className="p-3">Format-validated</th><th className="p-3">Active days</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.slug} className="border-b border-line/60"><td className="p-3">#{entry.rank}</td><td className="p-3"><a className="text-accent" href={`/teams/${entry.slug}`}>{entry.name}</a></td><td className="p-3">{entry.memberCount.toLocaleString()}</td><td className="p-3">{entry.contributionScore.toLocaleString()}</td><td className="p-3">{entry.consensusPassedContributions.toLocaleString()}</td><td className="p-3">{entry.formatValidatedSubmissions.toLocaleString()}</td><td className="p-3">{entry.activeDays.toLocaleString()}</td></tr>)}</tbody>
          </table>
        ) : <p className="p-5 text-sm text-slate-300">Team rankings will appear after public teams exist and complete eligible contributions.</p>}
      </div>
    </section>
  );
}

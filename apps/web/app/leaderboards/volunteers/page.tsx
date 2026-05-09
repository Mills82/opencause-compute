import { loadDb } from '../../../lib/db';
import { buildVolunteerLeaderboard } from '../../../lib/gamification/public';

export default async function VolunteerLeaderboardPage() {
  const entries = buildVolunteerLeaderboard(await loadDb());
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer leaderboard</p>
        <h1 className="text-4xl font-semibold tracking-tight">Opt-in volunteer recognition.</h1>
        <p className="text-slate-300">Private profiles are excluded. Anonymous public volunteers are shown without profile links.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {entries.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate-300"><tr><th className="p-3">Rank</th><th className="p-3">Volunteer</th><th className="p-3">Team</th><th className="p-3">Score</th><th className="p-3">Consensus-passed</th><th className="p-3">Format-validated</th><th className="p-3">Active days</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={`${entry.rank}-${entry.displayName}`} className="border-b border-line/60"><td className="p-3">#{entry.rank}</td><td className="p-3">{entry.slug ? <a className="text-accent" href={`/volunteers/${entry.slug}`}>{entry.displayName}</a> : entry.displayName}</td><td className="p-3">{entry.team ? <a className="text-accent" href={`/teams/${entry.team.slug}`}>{entry.team.name}</a> : '—'}</td><td className="p-3">{entry.contributionScore.toLocaleString()}</td><td className="p-3">{entry.consensusPassedContributions.toLocaleString()}</td><td className="p-3">{entry.formatValidatedSubmissions.toLocaleString()}</td><td className="p-3">{entry.activeDays.toLocaleString()}</td></tr>)}</tbody>
          </table>
        ) : <p className="p-5 text-sm text-slate-300">Volunteer rankings will appear after volunteers opt into public recognition and complete eligible contributions.</p>}
      </div>
    </section>
  );
}

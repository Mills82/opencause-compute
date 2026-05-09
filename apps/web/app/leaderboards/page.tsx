export default function LeaderboardsPage() {
  return (
    <section className="space-y-8">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Leaderboards</p>
        <h1 className="text-4xl font-semibold tracking-tight">Recognition for reliable open-science contribution.</h1>
        <p className="text-lg text-slate-300">
          Scores recognize useful, validated work. Raw idle time is capped so OpenCause rewards contribution quality, not electricity use.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <a className="rounded-xl border border-line bg-panel p-5 hover:border-accent" href="/leaderboards/volunteers">
          <h2 className="text-xl font-semibold">Volunteer leaderboard</h2>
          <p className="mt-2 text-sm text-slate-300">Opt-in public volunteer recognition with private profiles excluded.</p>
        </a>
        <a className="rounded-xl border border-line bg-panel p-5 hover:border-accent" href="/leaderboards/teams">
          <h2 className="text-xl font-semibold">Team leaderboard</h2>
          <p className="mt-2 text-sm text-slate-300">Public team totals for schools, communities, companies, families, and research supporters.</p>
        </a>
      </div>
      <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
        Leaderboards report candidate extraction and validation activity. They do not indicate scientific acceptance, clinical findings, or medical advice.
      </p>
    </section>
  );
}

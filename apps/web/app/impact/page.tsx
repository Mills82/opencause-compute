export const dynamic = 'force-dynamic';

import { loadDb } from '../../lib/db';
import { buildImpactSummary, buildTeamLeaderboard } from '../../lib/gamification/public';

function Metric({ label, value, emphasis = false }: { label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line/70 bg-panel/80 p-5 shadow-lg shadow-black/10 ${emphasis ? 'md:col-span-2' : ''}`}>
      <p className="text-3xl font-semibold text-white sm:text-4xl">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="mt-2 text-sm text-slate-300">{label}</p>
    </div>
  );
}

function formatPercent(value: number | null) {
  if (value === null) return '—';
  if (value > 0 && value < 0.01) return '<0.01%';
  return `${value.toFixed(2)}%`;
}

function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-white/10">
      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 shadow-[0_0_18px_rgba(56,189,248,0.45)]" style={{ width: `${Math.min(value ?? 0, 100)}%` }} />
    </div>
  );
}

export default async function ImpactPage() {
  const db = await loadDb();
  const impact = buildImpactSummary(db);
  const topTeams = buildTeamLeaderboard(db).slice(0, 3);
  const hasWork = impact.sectionsProcessed > 0 || impact.formatValidatedSubmissions > 0;
  const progress = impact.currentProjectProgress;

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_35%)]" />
        <div className="relative max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Impact dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Volunteer compute for open cancer research.</h1>
          <p className="text-lg text-slate-300">
            OpenCause Compute helps turn spare computing power into citation-backed research data from open-access cancer literature. This page tracks the project’s progress from raw literature to independently validated results.
          </p>
        </div>
      </div>

      {!hasWork ? (
        <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
          OpenCause Compute is preparing its first volunteer compute runs. Once work begins, this page will show aggregate processing activity, validated submissions, and completed research sections.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Literature sections processed" value={impact.sectionsProcessed} emphasis />
        <Metric label="Validated submissions" value={impact.formatValidatedSubmissions} emphasis />
        <Metric label="Consensus-complete sections" value={impact.consensusPassedContributions} />
        <Metric label="Volunteer profiles" value={impact.volunteers} />
        <Metric label="Active nodes" value={impact.activeNodes} />
        <Metric label="Public teams" value={impact.teams} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl shadow-black/20">
          <div className="border-b border-line/70 bg-gradient-to-br from-slate-900 via-slate-950 to-ink p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Current project</p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Cancer Knowledge Miner</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Building a structured, citation-backed map of findings from open-access cancer literature.</p>
              </div>
              <div className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">Open-access literature</div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 via-slate-900/70 to-emerald-300/10 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Research sections completed</p>
                  {progress.estimatedTotalPackets ? (
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                      {progress.consensusCompletedPackets.toLocaleString()} <span className="text-slate-500">/</span> ~{progress.estimatedTotalPackets.toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-white">{progress.consensusCompletedPackets.toLocaleString()} completed</p>
                  )}
                </div>
                <p className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white">{formatPercent(progress.percentComplete)}</p>
              </div>
              {progress.estimatedTotalPackets ? <ProgressBar value={progress.percentComplete} /> : null}
            </div>

            {progress.estimatedTotalPackets ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Eligible open-access cancer documents</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{progress.eligibleDocumentCount?.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Estimated research sections</p>
                  <p className="mt-2 text-2xl font-semibold text-white">~{progress.estimatedTotalPackets.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Validation work completed</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{progress.formatValidatedPackets.toLocaleString()} <span className="text-slate-500">/</span> ~{progress.estimatedConsensusSubmissionTarget?.toLocaleString()}</p>
                </div>
              </div>
            ) : null}

            {progress.estimatedTotalPackets ? (
              <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <p className="font-semibold text-white">Overall validation progress</p>
                  <p className="font-semibold text-slate-200">{formatPercent(progress.percentValidationWorkComplete)}</p>
                </div>
                <ProgressBar value={progress.percentValidationWorkComplete} />
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Estimates are based on the current open-access cancer literature corpus and will become more precise as the project processes more full-text documents.
                </p>
              </div>
            ) : (
              <p className="rounded-2xl border border-line/70 bg-ink/80 p-4 text-sm leading-6 text-slate-300">
                {progress.eligibleDocumentCount ? (
                  <>{progress.eligibleDocumentCount.toLocaleString()} eligible open-access cancer documents identified. Section estimates will appear after more full-text documents are processed.</>
                ) : (
                  <>Eligible open-access cancer document count has not been refreshed yet. Validated submission activity is shown separately above.</>
                )}
              </p>
            )}

            <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
              OpenCause Compute supports research organization and review. It does not provide medical advice, clinical findings, or accepted scientific conclusions.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-panel p-5 shadow-2xl shadow-black/20">
          <h2 className="text-xl font-semibold">Top teams</h2>
          {topTeams.length ? (
            <ol className="mt-4 space-y-3 text-sm text-slate-300">
              {topTeams.map((team) => <li key={team.slug}>#{team.rank} {team.name} — {team.contributionScore.toLocaleString()} contribution score</li>)}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-300">Team impact will appear after teams are created and begin contributing validated work.</p>
          )}
        </div>
      </div>
    </section>
  );
}

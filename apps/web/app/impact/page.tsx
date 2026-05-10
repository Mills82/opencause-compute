export const dynamic = 'force-dynamic';

import { loadDb } from '../../lib/db';
import { buildImpactSummary, buildTeamLeaderboard } from '../../lib/gamification/public';

function Metric({ label, value, emphasis = false }: { label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-5 ${emphasis ? 'md:col-span-2' : ''}`}>
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

export default async function ImpactPage() {
  const db = await loadDb();
  const impact = buildImpactSummary(db);
  const topTeams = buildTeamLeaderboard(db).slice(0, 3);
  const hasWork = impact.sectionsProcessed > 0 || impact.formatValidatedSubmissions > 0;
  const progress = impact.currentProjectProgress;

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Impact dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Open-science contribution, measured transparently.</h1>
          <p className="text-lg text-slate-300">
            OpenCause Compute turns spare compute into structured evidence work for open science. These numbers track processing, validation, and consensus progress — not clinical conclusions.
          </p>
        </div>
      </div>

      {!hasWork ? (
        <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
          OpenCause Compute is preparing its first volunteer compute runs. Once work begins, this page will show aggregate processing activity, structure-validated submissions, and consensus-passed evidence candidates.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Literature sections processed" value={impact.sectionsProcessed} emphasis />
        <Metric label="Structure-validated submissions" value={impact.formatValidatedSubmissions} emphasis />
        <Metric label="Consensus-passed evidence candidates" value={impact.consensusPassedContributions} />
        <Metric label="Volunteer profiles" value={impact.volunteers} />
        <Metric label="Active nodes" value={impact.activeNodes} />
        <Metric label="Public teams" value={impact.teams} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">Current project</h2>
          <p className="mt-2 text-slate-300">{impact.currentProject}: citation-backed evidence extraction from public/open biomedical literature.</p>
          <div className="mt-5 rounded-xl border border-line/70 bg-ink p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Consensus-completed literature sections</p>
                {progress.estimatedTotalPackets ? (
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {progress.consensusCompletedPackets.toLocaleString()} / ~{progress.estimatedTotalPackets.toLocaleString()}
                  </p>
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-white">{progress.consensusCompletedPackets.toLocaleString()} completed</p>
                )}
              </div>
              <p className="rounded-full border border-line px-3 py-1 text-sm text-slate-300">{formatPercent(progress.percentComplete)}</p>
            </div>
            {progress.estimatedTotalPackets ? (
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(progress.percentComplete ?? 0, 100)}%` }} />
              </div>
            ) : null}
            {progress.estimatedTotalPackets ? (
              <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
                <div className="rounded-lg border border-line/60 p-3">
                  <p className="font-semibold text-white">First-pass structure progress</p>
                  <p className="mt-1">{progress.formatValidatedPackets.toLocaleString()} / ~{progress.estimatedTotalPackets.toLocaleString()} packets ({formatPercent(progress.percentFormatValidated)})</p>
                </div>
                <div className="rounded-lg border border-line/60 p-3">
                  <p className="font-semibold text-white">Consensus-complete progress</p>
                  <p className="mt-1">{progress.consensusCompletedPackets.toLocaleString()} / ~{progress.estimatedTotalPackets.toLocaleString()} packets ({formatPercent(progress.percentComplete)})</p>
                </div>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-slate-400">
              {progress.estimatedTotalPackets ? (
                <>Estimated from {progress.eligibleDocumentCount?.toLocaleString()} eligible documents and {progress.ingestedDocumentCount.toLocaleString()} ingested documents averaging {progress.averagePacketsPerDocument.toFixed(1)} packets per document.</>
              ) : progress.eligibleDocumentCount ? (
                <>{progress.eligibleDocumentCount.toLocaleString()} eligible open-access cancer documents identified. Packet estimate will appear after at least {progress.sampleMinimumDocuments} full-text documents are ingested. Current full-text sample: {progress.ingestedDocumentCount.toLocaleString()} documents, {progress.packetsCreatedFromIngestedDocuments.toLocaleString()} packets.</>
              ) : (
                <>Eligible open-access cancer document count has not been refreshed yet. Structure-validated throughput is shown separately above.</>
              )}
            </p>
          </div>
          <p className="mt-4 rounded-lg border border-line/70 bg-ink p-3 text-sm text-slate-300">
            Evidence candidates are intermediate research-support artifacts. They are not medical advice, clinical findings, or accepted science.
          </p>
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
      </div>
    </section>
  );
}

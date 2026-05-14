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
  const validatedSectionsProcessed = impact.formatValidatedSubmissions;
  const submittedSectionsProcessed = impact.sectionsProcessed;
  const rejectedSections = Math.max(0, submittedSectionsProcessed - validatedSectionsProcessed);
  const hasWork = submittedSectionsProcessed > 0 || validatedSectionsProcessed > 0;
  const progress = impact.currentProjectProgress;
  const estimatedTotalPackets = progress.estimatedTotalPackets;
  const validationTarget = progress.estimatedConsensusSubmissionTarget;

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_35%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Impact dashboard</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Early progress against an enormous open-literature challenge.</h1>
            <p className="text-lg leading-8 text-slate-300">
              OpenCause Compute helps turn spare computing power into citation-backed research data from open-access cancer literature. This page tracks both the live beta activity and the long-term scale of Cancer Knowledge Miner.
            </p>
          </div>
          {estimatedTotalPackets ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-ink/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Long-term corpus estimate</p>
              <p className="mt-2 text-4xl font-semibold text-white sm:text-5xl">~{estimatedTotalPackets.toLocaleString()}</p>
              <p className="mt-2 text-sm text-slate-300">research sections estimated from {progress.eligibleDocumentCount?.toLocaleString()} eligible open-access cancer documents.</p>
            </div>
          ) : null}
        </div>
      </div>

      {!hasWork ? (
        <p className="rounded-xl border border-line bg-panel p-4 text-sm text-slate-300">
          OpenCause Compute is preparing its first volunteer compute runs. Once work begins, this page will show aggregate processing activity, validated submissions, and completed research sections.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Validated sections processed" value={validatedSectionsProcessed} emphasis />
        <Metric label="Consensus-complete sections" value={impact.consensusPassedContributions} />
        <Metric label="Active worker nodes" value={impact.activeNodes} />
        <Metric label="Volunteer profiles" value={impact.volunteers} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
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
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 via-slate-900/70 to-emerald-300/10 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Progress being made</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{validatedSectionsProcessed.toLocaleString()}</p>
                <p className="mt-2 text-sm text-slate-300">validated literature sections processed by early beta workers.</p>
                <p className="mt-4 text-sm leading-6 text-slate-300">Each one represents a signed literature packet processed by a worker and accepted by OpenCause structure and provenance validation.</p>
              </div>

              <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/10 via-slate-900/70 to-cyan-300/10 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100">Scale of the challenge</p>
                {estimatedTotalPackets ? (
                  <>
                    <p className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">~{estimatedTotalPackets.toLocaleString()}</p>
                    <p className="mt-2 text-sm text-slate-300">estimated research sections to process.</p>
                    <p className="mt-4 text-sm leading-6 text-slate-300">At full scale, independent validation may require roughly {validationTarget?.toLocaleString()} worker submissions before consensus and review.</p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-300">Corpus estimates will appear after enough full-text documents are sampled.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-line/70 bg-ink/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Pipeline status</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Early beta is strongest in first-pass processing and structure validation. Consensus grows as independent workers process overlapping sections.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">Limited beta</span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-line/70 bg-panel/60 p-4"><p className="text-2xl font-semibold text-white">{submittedSectionsProcessed.toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Worker submissions received</p></div>
                <div className="rounded-xl border border-line/70 bg-panel/60 p-4"><p className="text-2xl font-semibold text-white">{validatedSectionsProcessed.toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Passed structure validation</p></div>
                <div className="rounded-xl border border-line/70 bg-panel/60 p-4"><p className="text-2xl font-semibold text-white">{Math.max(0, validatedSectionsProcessed - impact.consensusPassedContributions).toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Awaiting independent consensus</p></div>
                <div className="rounded-xl border border-line/70 bg-panel/60 p-4"><p className="text-2xl font-semibold text-white">{impact.consensusPassedContributions.toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Consensus complete</p></div>
              </div>
              {rejectedSections > 0 ? <p className="mt-3 text-xs leading-5 text-slate-400">{rejectedSections.toLocaleString()} submitted section{rejectedSections === 1 ? '' : 's'} did not pass structure validation and are excluded from the public validated total.</p> : null}
            </div>

            {estimatedTotalPackets ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Eligible open-access cancer documents</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{progress.eligibleDocumentCount?.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Estimated research sections</p>
                  <p className="mt-2 text-2xl font-semibold text-white">~{estimatedTotalPackets.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                  <p className="text-sm text-slate-400">Validated share of estimated sections</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatPercent(progress.percentFormatValidated)}</p>
                </div>
              </div>
            ) : null}

            {estimatedTotalPackets ? (
              <div className="rounded-2xl border border-line/70 bg-ink/80 p-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <p className="font-semibold text-white">Long-term validation progress</p>
                  <p className="font-semibold text-slate-200">{formatPercent(progress.percentValidationWorkComplete)}</p>
                </div>
                <ProgressBar value={progress.percentValidationWorkComplete} />
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  This percentage is intentionally tiny in early beta because the corpus is large. It shows the scale of the open-literature challenge, while the beta metrics above show the working pipeline gaining traction.
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

        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-panel p-5 shadow-2xl shadow-black/20">
            <h2 className="text-xl font-semibold">Why the numbers matter</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <p><span className="font-semibold text-white">Validated sections:</span> worker outputs that passed OpenCause structure, citation, and provenance checks. This is pipeline validation, not scientific acceptance.</p>
              <p><span className="font-semibold text-white">Scale:</span> open cancer literature is vast. Millions of estimated sections mean the project is designed for sustained volunteer participation, not a one-off demo.</p>
              <p><span className="font-semibold text-white">Consensus:</span> candidate evidence becomes more useful after independent workers process overlapping sections and reviewers can inspect the source context.</p>
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
      </div>
    </section>
  );
}

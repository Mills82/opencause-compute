export const dynamic = 'force-dynamic';

import { getResults } from '../../lib/queries';
import { validationLevel, validationLevelDescription } from '../../lib/validation-labels';

export default async function ResultsPage() {
  const results = await getResults();

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Submissions</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Evidence extraction results</h1>
        <p className="text-sm text-slate-300">Evidence candidates are structure-checked and citation-backed. They are not scientifically validated, clinically meaningful, or medical advice.</p>
      </div>
      {results.map((result) => (
        <article key={result.id} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs text-slate-400">Result ID: {result.id}</p>
              <h2 className="mt-1 text-lg font-semibold">{validationLevel(result)}</h2>
              <p className="text-sm text-slate-300">{validationLevelDescription(validationLevel(result))}</p>
            </div>
            <span className="w-fit rounded-full border border-line px-3 py-1 text-xs text-slate-300">{result.claims.length} candidate evidence record{result.claims.length === 1 ? '' : 's'}</span>
          </div>

          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="rounded border border-line/70 p-3"><p className="text-white">Structure validated</p><p>{String(result.formatValidated ?? result.validated)}</p></div>
            <div className="rounded border border-line/70 p-3"><p className="text-white">Consensus</p><p>{result.consensusStatus}</p></div>
            <div className="rounded border border-line/70 p-3"><p className="text-white">Review</p><p>{result.reviewStatus}</p></div>
          </div>

          {result.provenance ? (
            <div className="mt-4 rounded border border-line/70 bg-ink p-3 text-xs text-slate-300">
              <p>Worker: {result.provenance.workerVersion} on {result.provenance.workerPlatform}</p>
              <p>Model/runtime: {result.provenance.modelProvider ?? 'unknown'} / {result.provenance.modelName ?? 'unknown'} · quality {result.provenance.generationQualityTier ?? 'unknown'}</p>
              <p>Prompt: {result.provenance.promptVersion} ({result.provenance.promptHash.slice(0, 12)})</p>
              <p>Validation: {result.provenance.resultValidationVersion}</p>
            </div>
          ) : null}

          <p className="mt-4 text-sm text-slate-300">Summary: {result.summary}</p>
          <div className="mt-3 space-y-2">
            {result.claims.map((claim) => (
              <div key={claim.id} className="rounded-md border border-line/80 p-3 text-sm">
                <p className="capitalize text-accent">{claim.claimType.replaceAll('_', ' ')} · {claim.evidenceOrigin.replaceAll('_', ' ')} · {claim.polarity}</p>
                <p className="mt-1">{claim.exactEvidenceSentence}</p>
                <p className="mt-2 text-xs text-slate-300">Confidence: {claim.confidence} · Priority: {claim.reviewPriority ?? 'medium'} · Citation: {claim.sourceCitation} ({claim.sourceUrl})</p>
              </div>
            ))}
            {!result.claims.length ? <p className="text-sm text-slate-400">No accepted candidate evidence records were stored for this submission.</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}

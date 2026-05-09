export const dynamic = 'force-dynamic';

import { getResults } from '../../lib/queries';
import { validationLevel, validationLevelDescription } from '../../lib/validation-labels';

export default async function ResultsPage() {
  const results = await getResults();

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Results</h2>
      <p className="text-sm text-slate-300">Candidate facts are schema/format checked and citation-backed. They are not scientifically validated, clinically meaningful, or medical advice.</p>
      {results.map((result) => (
        <article key={result.id} className="rounded-xl border border-line bg-panel p-4">
          <p className="text-sm">Result ID: {result.id}</p>
          <p className="text-sm text-slate-300">Extractor: {result.extractorVersion}</p>
          <p className="text-sm text-slate-300">Format validated: {String(result.formatValidated ?? result.validated)}</p>
          <p className="text-sm text-accent">Validation level: {validationLevel(result)}</p>
          <p className="text-xs text-slate-300">{validationLevelDescription(validationLevel(result))}</p>
          <p className="text-xs text-slate-400">Raw submission only: do not treat as accepted candidate fact unless consensus or human review passes.</p>
          {result.provenance ? (
            <div className="rounded border border-line/70 p-2 text-xs text-slate-300">
              <p>Worker: {result.provenance.workerVersion} on {result.provenance.workerPlatform}</p>
              <p>Model/runtime: {result.provenance.modelProvider ?? 'unknown'} / {result.provenance.modelName ?? 'unknown'}</p>
              <p>Prompt: {result.provenance.promptVersion} ({result.provenance.promptHash.slice(0, 12)})</p>
              <p>Validation: {result.provenance.resultValidationVersion}</p>
            </div>
          ) : null}
          <p className="text-sm text-slate-300">Summary: {result.summary}</p>
          <div className="mt-3 space-y-2">
            {result.facts.map((fact) => (
              <div key={fact.id} className="rounded-md border border-line/80 p-3 text-sm">
                <p>Relationship: {fact.relationshipType}</p>
                <p>Evidence: {fact.evidenceSentence}</p>
                <p>Confidence: {fact.confidence}</p>
                <p className="text-xs text-slate-300">
                  Citation: {fact.sourceCitation} ({fact.sourceUrl})
                </p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

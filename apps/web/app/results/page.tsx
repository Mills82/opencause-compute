export const dynamic = 'force-dynamic';

import { getResults } from '../../lib/queries';

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

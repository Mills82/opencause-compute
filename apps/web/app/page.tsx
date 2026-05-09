export default function HomePage() {
  return (
    <section className="space-y-10">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Private alpha</p>
        <h2 className="text-4xl font-semibold tracking-tight">Volunteer compute for AI-assisted open science.</h2>
        <p className="text-lg text-slate-300">
          OpenCause Compute coordinates opt-in worker nodes that process open-access biomedical literature into structured,
          citation-backed candidate facts for projects like Cancer Knowledge Miner.
        </p>
        <p className="text-slate-300">
          Results are format/schema validated first. They require consensus and/or human review before scientific use. OpenCause
          Compute is not medical advice and does not make clinical recommendations.
        </p>
        <div className="flex flex-wrap gap-3">
          <a className="rounded bg-accent px-4 py-2 text-ink" href="/about">
            Learn more
          </a>
          <a className="rounded border border-line px-4 py-2" href="/volunteer">
            Volunteer onboarding
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Open literature', 'Processes public/open-access scientific sources; no private medical records.'],
          ['Local AI workers', 'Volunteers can contribute idle compute in a controlled private-alpha workflow.'],
          ['Careful validation', 'Candidate facts keep citations, provenance, and validation status visible.']
        ].map(([title, body]) => (
          <article key={title} className="rounded-xl border border-line bg-panel p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-slate-300">{body}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <p className="font-medium text-white">Launch status</p>
        <p>
          This is a working private-alpha deployment. Public volunteer enrollment, consensus validation, abuse controls,
          and production legal/trust pages are still launch blockers before broad public release.
        </p>
      </div>
    </section>
  );
}

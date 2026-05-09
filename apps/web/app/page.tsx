export default function HomePage() {
  return (
    <section className="space-y-10">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">AI-assisted open science</p>
        <h2 className="text-4xl font-semibold tracking-tight">Turn idle compute into structured research evidence.</h2>
        <p className="text-lg text-slate-300">
          OpenCause Compute coordinates volunteer computers to help process open-access biomedical literature into structured,
          citation-backed candidate facts for research projects such as Cancer Knowledge Miner.
        </p>
        <p className="text-slate-300">
          Every extraction keeps its source citation, validation status, and provenance. Candidate facts require consensus and/or
          human review before scientific use. OpenCause Compute is not medical advice.
        </p>
        <div className="flex flex-wrap gap-3">
          <a className="rounded bg-accent px-4 py-2 text-ink" href="/about">
            Learn more
          </a>
          <a className="rounded border border-line px-4 py-2" href="/volunteer">
            Volunteer compute
          </a>
          <a className="rounded border border-line px-4 py-2" href="/download">
            Download worker
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Open literature', 'Workers process public/open-access scientific sources, not private medical records.'],
          ['Local AI workers', 'Volunteers contribute spare compute while keeping activity visible and controllable.'],
          ['Careful validation', 'Submissions remain candidate evidence until consensus and/or human review advances them.']
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
          OpenCause Compute is preparing for public volunteer participation. Some worker downloads may be labeled prototype until
          installer signing, desktop QA, and additional safety checks are complete.
        </p>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <section className="space-y-10">
      <div className="overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">AI-assisted open science</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Turn idle compute into structured research evidence.</h1>
            <p className="max-w-2xl text-lg text-slate-300">
              OpenCause Compute coordinates volunteer computers to help process open biomedical literature into structured,
              citation-backed candidate facts for projects such as Cancer Knowledge Miner.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a className="rounded bg-accent px-5 py-3 text-center font-semibold text-ink hover:no-underline" href="/download">
                Download worker
              </a>
              <a className="rounded border border-line px-5 py-3 text-center hover:border-accent hover:no-underline" href="/volunteer">
                Get enrollment code
              </a>
              <a className="rounded border border-line px-5 py-3 text-center hover:border-accent hover:no-underline" href="/impact">
                View impact
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-line/70 bg-ink p-5">
            <p className="text-sm font-medium text-white">What volunteers help create</p>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <div><p className="font-medium text-accent">1. Signed work packets</p><p>Coordinator assigns public/open literature sections to registered workers.</p></div>
              <div><p className="font-medium text-accent">2. Local model extraction</p><p>Workers extract candidate facts with exact evidence sentences and provenance.</p></div>
              <div><p className="font-medium text-accent">3. Validation and consensus</p><p>Submissions stay candidate evidence until schema checks, independent agreement, and/or review advance them.</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Open literature', 'Workers process public/open scientific sources, not private medical records.'],
          ['Volunteer controlled', 'Pause, inspect logs, tune resources, and choose when your computer contributes.'],
          ['Careful language', 'Metrics describe candidate extraction and validation work, not cures or clinical conclusions.']
        ].map(([title, body]) => (
          <article key={title} className="rounded-xl border border-line bg-panel p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-slate-300">{body}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <p className="font-medium text-white">Current project</p>
          <p className="mt-2">Cancer Knowledge Miner processes oncology and biomedical literature into citation-backed candidate facts.</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <p className="font-medium text-white">Launch status</p>
          <p className="mt-2">
            OpenCause Compute is in prototype/selected-beta readiness. Worker downloads may remain labeled prototype until installer signing, clean-machine QA, and additional safety checks are complete.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <section className="space-y-10">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl shadow-black/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_38%)]" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.12fr_0.88fr] lg:p-10">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">AI-assisted open science</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Turn spare compute into review-ready open-science evidence.</h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300">
              OpenCause Compute coordinates volunteer computers to process open biomedical literature into structured,
              citation-backed evidence for researcher review — starting with Cancer Knowledge Miner.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a className="rounded bg-accent px-5 py-3 text-center font-semibold text-ink hover:no-underline" href="/download">
                Download worker
              </a>
              <a className="rounded border border-line px-5 py-3 text-center hover:border-accent hover:no-underline" href="/volunteer">
                Request enrollment code
              </a>
              <a className="rounded border border-line px-5 py-3 text-center hover:border-accent hover:no-underline" href="/impact">
                View impact
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-ink/85 p-5 shadow-xl shadow-cyan-950/20">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">How it works</p>
            <div className="mt-5 space-y-4 text-sm text-slate-300">
              <div><p className="font-medium text-accent">1. Open literature packets</p><p>Public research sections are packaged with source citations and signed before assignment.</p></div>
              <div><p className="font-medium text-accent">2. Local volunteer processing</p><p>The desktop worker runs on a computer you control, with visible activity and adjustable resource limits.</p></div>
              <div><p className="font-medium text-accent">3. Validation and review</p><p>Submissions remain candidate evidence until structure checks, independent agreement, and/or human review advance them.</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Open literature only', 'Workers process public/open scientific literature — never private medical records or personal files.'],
          ['Volunteer-controlled', 'Pause anytime, inspect activity, tune resource limits, and decide when your computer contributes.'],
          ['Citation-backed', 'Each useful extraction keeps source text, citation, provenance, and validation status attached.'],
          ['Research-support outputs', 'Metrics show processing, validation, and review progress — not cures, clinical claims, or accepted findings.']
        ].map(([title, body]) => (
          <article key={title} className="rounded-xl border border-line bg-panel p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm leading-6 text-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Current research track</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Cancer Knowledge Miner</h2>
          <p className="mt-3">Cancer Knowledge Miner converts open oncology and biomedical literature into citation-backed evidence candidates for comparison, consensus, and review.</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm leading-6 text-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Limited beta status</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Early volunteers, conservative safeguards</h2>
          <p className="mt-3">
            OpenCause Compute is available as an early-access Windows worker while installer signing, compatibility testing, and additional review workflows continue. Volunteers should expect beta software and verify downloads before installing.
          </p>
        </div>
      </div>
    </section>
  );
}

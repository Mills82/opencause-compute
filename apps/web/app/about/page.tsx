export default function AboutPage() {
  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_35%)]" />
        <div className="relative max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">About OpenCause Compute</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Volunteer compute for careful, citation-backed open science.</h1>
          <p className="text-lg leading-8 text-slate-300">
            OpenCause Compute is a volunteer-compute network for AI-assisted open science. It turns open research literature
            into signed work packets, routes them to registered worker apps, and collects structured, citation-backed
            evidence for comparison, consensus, and review.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">What volunteers contribute</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Volunteers run a desktop worker app that can process open-access literature packets with a local AI model. The worker returns
            structured evidence candidates, source quotations, validation warnings, and provenance.
          </p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-xl font-semibold">How results should be used</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Results are research-support artifacts. They require consensus and/or human review before scientific use and should
            never be treated as medical advice, diagnosis, treatment guidance, or validated discoveries by themselves.
          </p>
        </article>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">First research track</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Cancer Knowledge Miner</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Cancer Knowledge Miner focuses on open biomedical literature. The goal is to make research evidence easier to inspect,
          compare, and verify — not to produce clinical recommendations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">Public sources</h2>
          <p className="mt-2">Workers process public/open scientific literature. OpenCause Compute is not designed to process personal health records or private documents.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">Volunteer control</h2>
          <p className="mt-2">The desktop app exposes pause controls, resource limits, logs, and local data removal so contributors can decide when and how their computer participates.</p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300">
          <h2 className="text-lg font-semibold text-white">Conservative claims</h2>
          <p className="mt-2">OpenCause reports processing and review progress. It does not present candidate extractions as accepted science, medical advice, or clinical guidance.</p>
        </article>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6 text-sm leading-6 text-slate-300">
        <h2 className="text-xl font-semibold text-white">Contact and accountability</h2>
        <p className="mt-2">
          OpenCause Compute is operated by AppAssist. For questions, security reports, or volunteer support, contact <a className="text-accent" href="mailto:alan@appassist.ai">alan@appassist.ai</a>.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/privacy">Privacy</a>
          <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/security">Security</a>
          <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/science-disclaimer">Science disclaimer</a>
          <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/responsible-disclosure">Responsible disclosure</a>
        </div>
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <h2 className="text-3xl font-semibold">About OpenCause Compute</h2>
        <p className="text-slate-300">
          OpenCause Compute is a volunteer-compute network for AI-assisted open science. The system divides research literature
          into signed work packets, sends them to registered worker nodes, and collects structured, citation-backed candidate
          facts for review.
        </p>
        <p className="text-slate-300">
          The first research track, Cancer Knowledge Miner, focuses on open biomedical literature. Its goal is to make evidence
          easier to inspect, compare, and review — not to produce clinical recommendations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-line bg-panel p-5">
          <h3 className="font-semibold">What volunteers contribute</h3>
          <p className="mt-2 text-sm text-slate-300">
            Volunteers run a worker app that can process open-access literature packets with a local AI model. The worker returns
            structured candidate facts, source evidence, validation warnings, and provenance.
          </p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-5">
          <h3 className="font-semibold">How results should be used</h3>
          <p className="mt-2 text-sm text-slate-300">
            Results are research-support artifacts. They require consensus and/or human review before scientific use and should
            never be treated as medical advice, diagnosis, treatment guidance, or validated discoveries on their own.
          </p>
        </article>
      </div>
    </section>
  );
}

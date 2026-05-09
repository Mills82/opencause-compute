export default function AboutPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">About OpenCause Compute V1</h2>
      <p className="text-slate-300">
        OpenCause Compute is a volunteer-compute platform for AI-powered open science. V1 is an infrastructure demo focused
        on secure packet coordination and structured extraction workflows.
      </p>
      <p className="text-slate-300">
        This release does not make medical claims. Local LLM v1 is the default extractor.
      </p>
    </section>
  );
}

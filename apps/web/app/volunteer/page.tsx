export default function VolunteerPage() {
  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer onboarding</p>
        <h2 className="text-3xl font-semibold">Contribute idle compute to AI-assisted open science.</h2>
        <p className="text-slate-300">
          Public self-serve enrollment is being prepared. The worker processes open-access/public literature packets, verifies
          coordinator signatures, records visible logs, and sends back citation-backed candidate facts with provenance.
        </p>
        <p className="text-slate-300">
          Results require consensus and/or human review before scientific use. OpenCause Compute is not medical advice.
        </p>
      </div>

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h3 className="text-lg font-medium text-white">Enrollment API foundation</h3>
        <p className="mt-2">
          The backend now supports self-serve one-time enrollment codes behind an abuse challenge and feature flag. Once the
          desktop installer is ready, this page can become the public download/signup flow.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>One-time enrollment code issued per volunteer signup.</li>
          <li>Code is consumed when the worker registers.</li>
          <li>Registered nodes can still be suspended or revoked.</li>
          <li>Installer/tray UX and stronger sandbox controls are still required before broad public launch.</li>
        </ul>
      </article>
    </section>
  );
}

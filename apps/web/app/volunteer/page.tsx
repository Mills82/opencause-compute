import { redirect } from 'next/navigation';
import { VolunteerEnrollForm } from './volunteer-enroll-form';

function publicEnrollmentEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
}

export default function VolunteerPage() {
  const enabled = publicEnrollmentEnabled();
  if (enabled) redirect('/volunteer/enroll');

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Volunteer</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Join the OpenCause Compute beta.</h1>
          <p className="text-slate-300">
            Public enrollment is not open on this deployment yet. Selected beta volunteers receive an enrollment code by email or from an OpenCause operator.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">1. Get a code</h2><p className="mt-2 text-sm text-slate-300">Enrollment codes attach a computer you control to your volunteer profile.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">2. Install worker</h2><p className="mt-2 text-sm text-slate-300">Download the desktop worker, install Ollama, and choose resource settings.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">3. Contribute safely</h2><p className="mt-2 text-sm text-slate-300">The worker processes signed packets and submits candidate facts with provenance.</p></article>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <VolunteerEnrollForm enabled={false} />
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <h2 className="text-xl font-semibold text-white">Want to prepare?</h2>
          <p className="mt-2">You can install the worker and review the science/safety notes before receiving an enrollment code.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a className="rounded bg-accent px-4 py-2 text-center font-semibold text-ink hover:no-underline" href="/download">Download worker</a>
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/impact">View impact</a>
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/science-disclaimer">Science disclaimer</a>
          </div>
        </div>
      </div>
    </section>
  );
}

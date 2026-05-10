import { VolunteerEnrollForm } from './volunteer-enroll-form';
import { publicVolunteerEnrollmentConfig } from '../../lib/volunteer-enrollment-config';

export const dynamic = 'force-dynamic';

export default function VolunteerPage() {
  const config = publicVolunteerEnrollmentConfig();

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Volunteer</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Volunteer your spare compute for open cancer research.</h1>
          <p className="text-slate-300">
            OpenCause Compute is in limited beta. Enrollment codes connect a computer you control to an OpenCause volunteer profile. Use your code only in the official OpenCause Compute Worker app.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">1. Get a code</h2><p className="mt-2 text-sm text-slate-300">Request an enrollment code using the Turnstile-protected form below.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">2. Install worker</h2><p className="mt-2 text-sm text-slate-300">Download the desktop worker, install Ollama, and choose resource settings.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5"><h2 className="font-semibold">3. Contribute transparently</h2><p className="mt-2 text-sm text-slate-300">The worker processes signed packets, shows activity locally, and submits citation-backed evidence with provenance.</p></article>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">You control participation</h2><p className="mt-2">Pause anytime, run only while idle, limit CPU use, avoid battery work, and inspect worker activity locally.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">Open sources only</h2><p className="mt-2">The worker processes public/open scientific literature, not personal medical records or private files.</p></article>
        <article className="rounded-xl border border-line bg-panel p-5 text-sm leading-6 text-slate-300"><h2 className="font-semibold text-white">Careful outputs</h2><p className="mt-2">Submissions are citation-backed research-support artifacts that still require validation, consensus, and/or review.</p></article>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <VolunteerEnrollForm enabled={config.enabled} turnstileSiteKey={config.turnstileSiteKey} />
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <h2 className="text-xl font-semibold text-white">What happens next?</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5">
            <li>We email a one-time enrollment code if enrollment is available.</li>
            <li>You install the worker and paste the code during setup.</li>
            <li>The worker gives you a profile setup link for privacy/team/impact preferences.</li>
          </ol>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a className="rounded bg-accent px-4 py-2 text-center font-semibold text-ink hover:no-underline" href="/download">Download worker</a>
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/impact">View impact</a>
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/science-disclaimer">Science disclaimer</a>
          </div>
        </div>
      </div>
    </section>
  );
}

import { VolunteerEnrollForm } from '../volunteer-enroll-form';

function publicEnrollmentEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
}

export default function VolunteerEnrollPage() {
  const enabled = publicEnrollmentEnabled();
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Volunteer enrollment</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Get an OpenCause worker enrollment code.</h1>
          <p className="text-slate-300">
            Enrollment codes attach a computer you control to an OpenCause volunteer profile. Use the code only in the official OpenCause Compute Worker app.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <VolunteerEnrollForm enabled={enabled} />
        <aside className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
          <h2 className="text-xl font-semibold text-white">What happens next?</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5">
            <li>We email a one-time enrollment code if enrollment is available.</li>
            <li>You install the worker and paste the code during setup.</li>
            <li>The worker gives you a profile setup link for privacy/team/impact preferences.</li>
          </ol>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/download">Download worker</a>
            <a className="rounded border border-line px-4 py-2 text-center hover:border-accent hover:no-underline" href="/science-disclaimer">Science disclaimer</a>
          </div>
        </aside>
      </div>
    </section>
  );
}

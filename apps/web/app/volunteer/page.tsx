import Script from 'next/script';
import { VolunteerEnrollForm } from './volunteer-enroll-form';

export default function VolunteerPage() {
  const enabled = process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;

  return (
    <section className="space-y-6">
      {enabled && turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer compute</p>
        <h2 className="text-3xl font-semibold">Help process open science literature with your computer.</h2>
        <p className="text-slate-300">
          A worker node downloads signed research packets, verifies them, runs an approved local extraction workflow, and sends
          back citation-backed candidate facts with provenance.
        </p>
        <p className="text-slate-300">
          You stay in control: worker activity should be visible, pausable, and limited by resource settings. OpenCause Compute
          does not process private medical records and is not medical advice.
        </p>
      </div>

      <VolunteerEnrollForm enabled={enabled} turnstileSiteKey={turnstileSiteKey} />

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h3 className="text-lg font-medium text-white">Before you join</h3>
        <p className="mt-2">
          Public volunteer enrollment is opening carefully. Worker builds may be marked prototype while installer signing,
          desktop QA, and additional resource-control checks are completed.
        </p>
      </article>
    </section>
  );
}

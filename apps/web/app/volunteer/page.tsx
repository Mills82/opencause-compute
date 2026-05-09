import Script from 'next/script';
import { VolunteerEnrollForm } from './volunteer-enroll-form';

export default function VolunteerPage() {
  const enabled = process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;

  return (
    <section className="space-y-6">
      {enabled && turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <div className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Volunteer onboarding</p>
        <h2 className="text-3xl font-semibold">Contribute idle compute to AI-assisted open science.</h2>
        <p className="text-slate-300">
          OpenCause Compute workers process open-access/public literature packets, verify coordinator signatures, record visible
          logs, and send back citation-backed candidate facts with provenance.
        </p>
        <p className="text-slate-300">
          Results require consensus and/or human review before scientific use. OpenCause Compute is not medical advice.
        </p>
      </div>

      <VolunteerEnrollForm enabled={enabled} turnstileSiteKey={turnstileSiteKey} />

      <article className="rounded-xl border border-line bg-panel p-5 text-sm text-slate-300">
        <h3 className="text-lg font-medium text-white">Before public download</h3>
        <p className="mt-2">
          The backend supports self-serve one-time enrollment codes, but broad public participation still needs the packaged
          desktop worker app, stronger sandbox/resource controls, and production-grade abuse monitoring.
        </p>
      </article>
    </section>
  );
}

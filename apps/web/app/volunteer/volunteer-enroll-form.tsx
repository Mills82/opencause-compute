'use client';

import Script from 'next/script';
import { FormEvent, useState } from 'react';

export function VolunteerEnrollForm({ enabled, turnstileSiteKey }: { enabled: boolean; turnstileSiteKey?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(enabled ? 'Enter your email to request a one-time worker enrollment code.' : 'Volunteer enrollment is not open yet.');
  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled) return;
    setStatus('Requesting enrollment code...');
    setEnrollmentCode(null);

    const token = (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value;
    const response = await fetch('/api/volunteer/enroll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, ...(token ? { turnstileToken: token } : {}) })
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(json.error === 'challenge_failed' ? 'Verification failed. Refresh and try again.' : `Enrollment request failed: ${json.error ?? response.status}`);
      return;
    }

    setEnrollmentCode(json.enrollmentCode ?? null);
    setStatus(json.enrollmentCode ? 'Enrollment code issued. Save it now; it is shown only once.' : 'Enrollment code sent. Check your email for next steps.');
  }

  return (
    <form className="space-y-4 rounded-xl border border-line bg-panel p-5" onSubmit={submit}>
      <div>
        <h3 className="text-lg font-medium">Request worker access</h3>
        <p className="mt-1 text-sm text-slate-300">
          We’ll send a one-time enrollment code for registering a worker on a computer you control.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          We use this email to send your enrollment code and setup-related messages. The desktop app lets you pause work and remove local worker data.
        </p>
      </div>
      <label className="block text-sm">
        <span className="block text-slate-300">Email</span>
        <input
          className="mt-1 w-full rounded border border-line bg-ink p-2"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!enabled}
          required
        />
      </label>
      {enabled && turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      ) : null}
      <button className="rounded bg-accent px-4 py-2 text-ink disabled:opacity-50" type="submit" disabled={!enabled}>
        Request enrollment code
      </button>
      <p className="text-sm text-slate-300">{status}</p>
      {enrollmentCode ? (
        <div className="space-y-2 rounded border border-line bg-ink p-3 text-sm">
          <p className="font-medium text-white">One-time enrollment code</p>
          <code className="block break-all text-accent">{enrollmentCode}</code>
          <p className="text-slate-300">
            Use this code only on a computer you control. Open the desktop worker and enter the code during registration.
          </p>
        </div>
      ) : null}
    </form>
  );
}

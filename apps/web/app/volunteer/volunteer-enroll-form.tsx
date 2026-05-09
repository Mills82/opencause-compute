'use client';

import { FormEvent, useState } from 'react';

export function VolunteerEnrollForm({ enabled, turnstileSiteKey }: { enabled: boolean; turnstileSiteKey?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(enabled ? 'Enter your email to request a one-time worker enrollment code.' : 'Public enrollment is not enabled yet.');
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
      setStatus(json.error === 'challenge_failed' ? 'Anti-abuse challenge failed. Refresh and try again.' : `Enrollment failed: ${json.error ?? response.status}`);
      return;
    }

    setEnrollmentCode(json.enrollmentCode);
    setStatus('Enrollment code issued. Save it now; it is shown only once.');
  }

  return (
    <form className="space-y-4 rounded-xl border border-line bg-panel p-5" onSubmit={submit}>
      <div>
        <h3 className="text-lg font-medium">Volunteer signup</h3>
        <p className="mt-1 text-sm text-slate-300">
          This creates a one-time code for registering a worker node. The code is consumed when your worker registers.
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
      {enabled && turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}
      <button className="rounded bg-accent px-4 py-2 text-ink disabled:opacity-50" type="submit" disabled={!enabled}>
        Request enrollment code
      </button>
      <p className="text-sm text-slate-300">{status}</p>
      {enrollmentCode ? (
        <div className="space-y-2 rounded border border-line bg-ink p-3 text-sm">
          <p className="font-medium text-white">One-time enrollment code</p>
          <code className="block break-all text-accent">{enrollmentCode}</code>
          <p className="text-slate-300">
            Future desktop installers will apply this automatically. CLI/private-alpha users can set <code>NODE_ENROLLMENT_CODE</code> or pass <code>--enrollment-code</code> during registration.
          </p>
        </div>
      ) : null}
    </form>
  );
}

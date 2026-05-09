'use client';

import { useState } from 'react';

export function ReportPublicContentForm({ targetType, targetSlug }: { targetType: string; targetSlug: string }) {
  const [status, setStatus] = useState('');
  async function submit(formData: FormData) {
    setStatus('Sending report…');
    const res = await fetch('/api/report-public-content', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType,
        targetSlug,
        reason: String(formData.get('reason') ?? ''),
        details: String(formData.get('details') ?? ''),
        reporterContact: String(formData.get('reporterContact') ?? '') || undefined
      })
    });
    const json = await res.json();
    setStatus(res.ok ? 'Report received. Thank you.' : `Report failed: ${json.error ? JSON.stringify(json.error) : 'unknown error'}`);
  }
  return (
    <form action={submit} className="space-y-4 rounded-xl border border-line bg-panel p-5">
      <label className="block text-sm"><span className="text-slate-300">Reason</span><input name="reason" required maxLength={80} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" placeholder="Offensive name, misleading content, privacy concern…" /></label>
      <label className="block text-sm"><span className="text-slate-300">Details optional</span><textarea name="details" maxLength={1000} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" /></label>
      <label className="block text-sm"><span className="text-slate-300">Contact optional</span><input name="reporterContact" maxLength={200} className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-white" /></label>
      <button className="rounded bg-accent px-4 py-2 text-ink" type="submit">Submit report</button>
      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </form>
  );
}

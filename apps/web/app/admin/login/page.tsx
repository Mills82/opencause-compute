'use client';

import { FormEvent, useState } from 'react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Admin login required.');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('Checking credentials...');
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      setStatus('Login failed. Check the private-alpha admin password.');
      return;
    }
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || '/admin';
  }

  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border border-line bg-panel p-6">
      <h2 className="text-2xl font-semibold">Private-alpha admin login</h2>
      <p className="text-sm text-slate-300">
        Coordinator dashboards and worker controls are restricted. Public visitors can use the public site without admin access.
      </p>
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm">
          <span className="block text-slate-300">Admin password</span>
          <input
            className="mt-1 w-full rounded border border-line bg-ink p-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button className="rounded bg-accent px-4 py-2 text-ink" type="submit">
          Sign in
        </button>
      </form>
      <p className="text-sm text-slate-300">{status}</p>
    </section>
  );
}

'use client';

import { useState } from 'react';
import type { WorkerControlConfig } from '@opencause/shared';

type Props = {
  initialConfig: WorkerControlConfig;
};

export default function WorkerControlPanel({ initialConfig }: Props) {
  const [paused, setPaused] = useState(initialConfig.paused);
  const [idleMode, setIdleMode] = useState<WorkerControlConfig['idleMode']>(initialConfig.idleMode);
  const [minIdleSeconds, setMinIdleSeconds] = useState(String(initialConfig.minIdleSeconds));
  const [maxCpuPercent, setMaxCpuPercent] = useState(String(initialConfig.maxCpuPercent));
  const [status, setStatus] = useState('');

  async function save() {
    setStatus('Saving...');
    const response = await fetch('/api/worker/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        paused,
        idleMode,
        minIdleSeconds: Number(minIdleSeconds),
        maxCpuPercent: Number(maxCpuPercent)
      })
    });

    if (!response.ok) {
      setStatus('Failed to save control settings');
      return;
    }

    setStatus('Saved');
  }

  async function runNow() {
    setStatus('Triggering run-now...');
    const response = await fetch('/api/worker/run-now', { method: 'POST' });
    setStatus(response.ok ? 'Run-now queued for next worker loop tick' : 'Failed to trigger run-now');
  }

  return (
    <article className="rounded-xl border border-line bg-panel p-4 text-sm space-y-3">
      <h3 className="text-lg font-medium">Worker Controls</h3>
      <p className="text-slate-300">Configure idle/load behavior and manually run one packet for testing.</p>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
        Paused
      </label>

      <label className="block">
        <span className="block text-slate-300">Idle mode</span>
        <select
          className="mt-1 w-full rounded border border-line bg-ink p-2"
          value={idleMode}
          onChange={(e) => setIdleMode(e.target.value as WorkerControlConfig['idleMode'])}
        >
          <option value="user-and-cpu">User idle + CPU</option>
          <option value="cpu-only">CPU only</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-slate-300">Minimum idle seconds</span>
        <input
          className="mt-1 w-full rounded border border-line bg-ink p-2"
          type="number"
          min={0}
          value={minIdleSeconds}
          onChange={(e) => setMinIdleSeconds(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="block text-slate-300">Maximum CPU percent</span>
        <input
          className="mt-1 w-full rounded border border-line bg-ink p-2"
          type="number"
          min={1}
          max={100}
          value={maxCpuPercent}
          onChange={(e) => setMaxCpuPercent(e.target.value)}
        />
      </label>

      <div className="flex gap-2">
        <button className="rounded bg-accent px-3 py-2 text-ink" onClick={save}>
          Save settings
        </button>
        <button className="rounded border border-line px-3 py-2" onClick={runNow}>
          Run one packet now
        </button>
      </div>

      {status ? <p className="text-slate-300">{status}</p> : null}
    </article>
  );
}

export const dynamic = 'force-dynamic';

import { getWorkPackets } from '../../lib/queries';

function label(status: string) {
  return status.replaceAll('_', ' ');
}

export default async function WorkPacketsPage() {
  const packets = await getWorkPackets();
  const counts = packets.reduce<Record<string, number>>((acc, packet) => {
    acc[packet.displayStatus] = (acc[packet.displayStatus] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent sm:text-sm">Coordinator work queue</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Work packets</h1>
        <p className="text-slate-300">Queued packets include brand-new first-pass work and packets waiting for an independent second worker for consensus.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(counts).map(([status, count]) => (
          <article key={status} className="rounded-xl border border-line bg-panel p-4">
            <p className="text-2xl font-semibold text-accent">{count.toLocaleString()}</p>
            <p className="text-sm capitalize text-slate-300">{label(status)}</p>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        {packets.map((packet) => (
          <article key={packet.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-medium">{packet.title}</h2>
                <p className="mt-1 text-sm capitalize text-accent">{label(packet.displayStatus)}</p>
              </div>
              <p className="rounded-full border border-line px-3 py-1 text-xs text-slate-300">{packet.resultCount} submission{packet.resultCount === 1 ? '' : 's'}</p>
            </div>
            <p className="mt-2 text-xs text-slate-300">Citation: {packet.sourceCitation}</p>
            <p className="text-xs text-slate-300">Input hash: {packet.inputHash.slice(0, 16)}...</p>
          </article>
        ))}
      </div>
    </section>
  );
}

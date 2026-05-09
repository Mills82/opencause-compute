export const dynamic = 'force-dynamic';

import { getWorkPackets } from '../../lib/queries';

export default async function WorkPacketsPage() {
  const packets = await getWorkPackets();

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Work Packets</h2>
      <div className="space-y-3">
        {packets.map((packet) => (
          <article key={packet.id} className="rounded-xl border border-line bg-panel p-4">
            <h3 className="font-medium">{packet.title}</h3>
            <p className="text-sm text-slate-300">Status: {packet.status}</p>
            <p className="mt-1 text-xs text-slate-300">Citation: {packet.sourceCitation}</p>
            <p className="text-xs text-slate-300">Input hash: {packet.inputHash.slice(0, 16)}...</p>
          </article>
        ))}
      </div>
    </section>
  );
}

import { getDashboardData } from '../lib/queries';

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold">Coordinator Dashboard</h2>
        <p className="text-slate-300">
          OpenCause Compute V1 demonstrates vetted work-packet coordination, signed payload verification, and structured
          mock extraction.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Projects', data.projectCount],
          ['Work Packets', data.packetCount],
          ['Queued Packets', data.queuedCount],
          ['Nodes', data.nodeCount],
          ['Results', data.resultCount],
          ['Validated Results', data.validatedCount]
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-sm text-slate-300">{label}</p>
            <p className="text-2xl font-semibold text-accent">{value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="font-medium">Extractor mode</p>
        <p className="text-sm text-slate-300">Local LLM v1 is the default extractor in release mode.</p>
      </div>
    </section>
  );
}

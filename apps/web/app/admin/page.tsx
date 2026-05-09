export const dynamic = 'force-dynamic';

import { getDashboardData } from '../../lib/queries';

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold">Coordinator Dashboard</h2>
        <p className="text-slate-300">
          Private-alpha operations for OpenCause Compute. Candidate facts are format validated only until consensus and/or human
          review is complete; this dashboard is not public-facing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Projects', data.projectCount],
          ['Work Packets', data.packetCount],
          ['Queued Packets', data.queuedCount],
          ['Nodes', data.nodeCount],
          ['Results', data.resultCount],
          ['Format-validated Results', data.validatedCount]
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-sm text-slate-300">{label}</p>
            <p className="text-2xl font-semibold text-accent">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Projects', '/projects'],
          ['Work packets', '/work-packets'],
          ['Results', '/results'],
          ['Nodes and controls', '/nodes']
        ].map(([label, href]) => (
          <a key={href} className="rounded border border-line bg-panel px-4 py-3" href={href}>
            {label}
          </a>
        ))}
      </div>
    </section>
  );
}

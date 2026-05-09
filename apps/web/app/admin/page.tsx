export const dynamic = 'force-dynamic';

import { getDashboardData } from '../../lib/queries';

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  const cards = [
    ['Projects', data.projectCount],
    ['Queued packets', data.queuedCount],
    ['Claimed packets', data.claimedPacketCount],
    ['Completed packets', data.completedPacketCount],
    ['Active claims', data.activeClaimCount],
    ['Expired claims', data.expiredClaimCount],
    ['Nodes online/offline', `${data.onlineNodeCount}/${data.offlineNodeCount}`],
    ['Nodes suspended/revoked', `${data.suspendedNodeCount}/${data.revokedNodeCount}`],
    ['Raw submissions', data.resultCount],
    ['Format-validated submissions', data.formatValidatedCount],
    ['Consensus pending', data.consensusPendingCount],
    ['Consensus passed', data.consensusPassedCount],
    ['Needs human review', data.humanReviewNeededCount],
    ['Validation/consensus failures', data.failedValidationCount],
    ['Failed ingestion runs', data.failedIngestionRunCount],
    ['Audit events', data.auditEventCount]
  ] as const;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold">Coordinator Dashboard</h2>
        <p className="text-slate-300">
          Private-alpha operations for OpenCause Compute. Candidate facts are format validated only until consensus and/or human
          review is complete; this dashboard is not public-facing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-sm text-slate-300">{label}</p>
            <p className="text-2xl font-semibold text-accent">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-lg font-medium">Worker control status</h3>
          <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div><dt className="text-white">Paused</dt><dd>{String(data.workerControl.paused)}</dd></div>
            <div><dt className="text-white">Idle mode</dt><dd>{data.workerControl.idleMode}</dd></div>
            <div><dt className="text-white">Minimum idle seconds</dt><dd>{data.workerControl.minIdleSeconds}</dd></div>
            <div><dt className="text-white">Maximum CPU percent</dt><dd>{data.workerControl.maxCpuPercent}</dd></div>
            <div><dt className="text-white">Run-now token</dt><dd>{data.workerControl.runNowToken}</dd></div>
            <div><dt className="text-white">Updated</dt><dd>{data.workerControl.updatedAt}</dd></div>
          </dl>
          <a className="mt-4 inline-block rounded border border-line px-3 py-2 text-sm" href="/nodes">
            Manage nodes and worker controls
          </a>
        </article>

        <article className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-lg font-medium">Incident response quick notes</h3>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-slate-300">
            <li>Pause all work: open Nodes and set Worker Controls → Paused.</li>
            <li>Revoke/suspend a node: <code>POST /api/admin/nodes/:nodeId/status</code>.</li>
            <li>Disable scheduled ingestion: unset/disable the Vercel cron or set <code>ENABLE_CRON_INGEST=false</code>.</li>
            <li>Rotate packet keys: deploy a new Ed25519 keypair and update <code>PACKET_SIGNING_KEY_ID</code>.</li>
            <li>Rotate node access: revoke the affected node and require re-enrollment.</li>
          </ul>
        </article>
      </div>

      <article className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-medium">Recent ingestion runs</h3>
            <p className="text-sm text-slate-300">Admin-only ingestion health and failure visibility.</p>
          </div>
          <a className="rounded border border-line px-3 py-2 text-sm" href="/api/admin/ingestion-runs">
            JSON
          </a>
        </div>
        {data.recentIngestionRuns.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="py-2">Started</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Fetched</th>
                  <th>Skipped</th>
                  <th>Failed</th>
                  <th>Packets</th>
                </tr>
              </thead>
              <tbody>
                {data.recentIngestionRuns.map((run) => (
                  <tr key={run.id} className="border-t border-line/70 text-slate-300">
                    <td className="py-2">{run.startedAt}</td>
                    <td>{run.status}</td>
                    <td>{run.sourceType}</td>
                    <td>{run.fetchedCount}</td>
                    <td>{run.skippedCount}</td>
                    <td>{run.failedCount}</td>
                    <td>{run.packetsCreated}/{run.packetsSkipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-300">No ingestion runs recorded yet.</p>
        )}
      </article>

      <article className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-medium">Recent audit events</h3>
            <p className="text-sm text-slate-300">Security and operations history for admin/node/cron/system actions.</p>
          </div>
          <a className="rounded border border-line px-3 py-2 text-sm" href="/api/admin/audit-events">
            JSON
          </a>
        </div>
        {data.recentAuditEvents.length ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {data.recentAuditEvents.map((event) => (
              <li key={event.id} className="rounded border border-line/70 p-2">
                <span className="text-white">{event.action}</span> · {event.actorType} · {event.createdAt}
                {event.targetType ? <span> · {event.targetType}:{event.targetId}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-300">No audit events recorded yet.</p>
        )}
      </article>

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

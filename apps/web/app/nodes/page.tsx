import { getNodes, getWorkerControlConfig } from '../../lib/queries';
import WorkerControlPanel from './worker-control-panel';

export default async function NodesPage() {
  const [nodes, workerControl] = await Promise.all([getNodes(), getWorkerControlConfig()]);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Volunteer Nodes</h2>
      <WorkerControlPanel initialConfig={workerControl} />
      <div className="space-y-3">
        {nodes.map((node) => (
          <article key={node.id} className="rounded-xl border border-line bg-panel p-4 text-sm">
            <p>Name: {node.nodeName}</p>
            <p>Platform: {node.platform}</p>
            <p>Version: {node.version}</p>
            <p>Status: {node.status}</p>
            <p>Last heartbeat: {node.lastHeartbeatAt ?? 'never'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

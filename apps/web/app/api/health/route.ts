import { NextResponse } from 'next/server';
import { loadDb } from '../../../lib/db';
import { isHostedMode, productionEnvStatus } from '../../../lib/runtime-config';

export async function GET() {
  const db = await loadDb();
  const env = productionEnvStatus();
  return NextResponse.json({
    ok: env.ok,
    app: 'opencause-compute',
    version: process.env.npm_package_version ?? '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? null,
    storageMode: process.env.DATABASE_URL ? 'postgres' : 'file',
    deploymentMode: isHostedMode() ? 'hosted' : 'dev',
    envValidation: { ok: env.ok, missingRequiredKeys: env.missing },
    counts: {
      projects: db.projects.length,
      workPackets: db.workPackets.length,
      queuedWorkPackets: db.workPackets.filter((packet) => packet.status === 'queued').length,
      nodes: db.nodes.length,
      results: db.results.length
    }
  });
}

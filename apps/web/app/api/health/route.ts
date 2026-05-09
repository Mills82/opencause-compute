export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadDb, storageModeLabel } from '../../../lib/db';
import { isHostedMode, productionEnvStatus } from '../../../lib/runtime-config';
import { packetSigningDiagnostics } from '../../../lib/signing-diagnostics';

import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../lib/rate-limit';
export async function GET(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'publicApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const db = await loadDb();
  const env = productionEnvStatus();
  const signing = packetSigningDiagnostics();
  return NextResponse.json({
    ok: env.ok,
    app: 'opencause-compute',
    version: process.env.npm_package_version ?? '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? null,
    storageMode: storageModeLabel(),
    deploymentMode: isHostedMode() ? 'hosted' : 'dev',
    signingMode: signing.signingMode,
    signingDiagnostics: signing,
    envValidation: { ok: env.ok, missingRequiredKeys: env.missing },
    counts: {
      projects: db.projects.length,
      workPackets: db.workPackets.length,
      queuedWorkPackets: db.workPackets.filter((packet) => packet.status === 'queued').length,
      nodes: db.nodes.length,
      results: db.results.length,
      ingestionRuns: db.ingestionRuns.length,
      failedIngestionRuns: db.ingestionRuns.filter((run) => run.status === 'failed' || run.status === 'partial_failed').length,
      auditEvents: db.auditEvents.length,
      volunteerEnrollments: db.volunteerEnrollments.length
    }
  });
}

import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '../../../../lib/admin-auth';
import { recordAuditEvent } from '../../../../lib/audit';
import { withDb } from '../../../../lib/db';
import { checkNamedRateLimitAsync, rateLimitResponse } from '../../../../lib/rate-limit';

function resetEnabled(): boolean {
  return process.env.ENABLE_ADMIN_TEST_RESET === 'true';
}

export async function POST(request: Request) {
  const rateLimit = await checkNamedRateLimitAsync(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!resetEnabled()) {
    return NextResponse.json({ error: 'test_reset_disabled' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== 'RESET_TEST_STATE') {
    return NextResponse.json({ error: 'confirmation_required', required: 'RESET_TEST_STATE' }, { status: 400 });
  }

  const summary = await withDb((db) => {
    const before = {
      projects: db.projects.length,
      workPackets: db.workPackets.length,
      nodes: db.nodes.length,
      claims: db.claims.length,
      results: db.results.length,
      extractedClaims: db.extractedClaims.length,
      ingestionRuns: db.ingestionRuns.length,
      volunteerEnrollments: db.volunteerEnrollments.length
    };

    db.projects = [];
    db.workPackets = [];
    db.nodes = [];
    db.claims = [];
    db.results = [];
    db.extractedClaims = [];
    db.ingestionRuns = [];
    db.volunteerEnrollments = [];
    db.workerControl = {
      paused: false,
      idleMode: 'user-and-cpu',
      minIdleSeconds: 120,
      maxCpuPercent: 35,
      runNowToken: 0,
      updatedAt: new Date().toISOString()
    };

    recordAuditEvent(db, {
      actorType: 'admin',
      action: 'test_state.reset',
      targetType: 'database_state',
      targetId: 'hosted',
      metadata: before
    });

    return { before, after: { auditEvents: db.auditEvents.length } };
  });

  return NextResponse.json({ ok: true, summary });
}

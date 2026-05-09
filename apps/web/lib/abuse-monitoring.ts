import type { AuditEvent, DatabaseState } from '@opencause/shared';

export type AbuseSignal = {
  id: string;
  label: string;
  severity: 'info' | 'warn' | 'critical';
  count: number;
  threshold: number;
  detail: string;
};

export type AbuseMonitoringSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  signals: AbuseSignal[];
  alertingConfigured: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recentEvents(db: DatabaseState, windowMinutes: number): AuditEvent[] {
  const since = Date.now() - windowMinutes * 60_000;
  return db.auditEvents.filter((event) => Date.parse(event.createdAt) >= since);
}

function signal(
  id: string,
  label: string,
  count: number,
  threshold: number,
  detail: string,
  criticalMultiplier = 3
): AbuseSignal {
  return {
    id,
    label,
    count,
    threshold,
    detail,
    severity: count >= threshold * criticalMultiplier ? 'critical' : count >= threshold ? 'warn' : 'info'
  };
}

export function abuseMonitoringSnapshot(db: DatabaseState, windowMinutes = envInt('ABUSE_MONITOR_WINDOW_MINUTES', 60)): AbuseMonitoringSnapshot {
  const events = recentEvents(db, windowMinutes);
  const publicEnrollments = events.filter((event) => event.action === 'volunteer_enrollment.issued');
  const failedChallenges = events.filter((event) => event.action === 'volunteer_enrollment.challenge_failed');
  const deliveryFailures = events.filter(
    (event) => event.action === 'volunteer_enrollment.delivery' && (event.metadata.delivery as { sent?: boolean } | undefined)?.sent === false
  );
  const registrations = events.filter((event) => event.action === 'node.registered');
  const claims = events.filter((event) => event.action === 'work.claim.created' || event.action === 'work.claim.reused');
  const submissions = events.filter((event) => event.action === 'work.submit.completed');
  const validationFailures = events.filter(
    (event) => event.action === 'work.submit.completed' && Number(event.metadata.validationErrors ?? 0) > 0
  );
  const revokedOrSuspended = events.filter((event) => event.action === 'node.status.updated' && ['revoked', 'suspended'].includes(String(event.metadata.status)));

  const signals = [
    signal('public_enrollments', 'Public enrollment volume', publicEnrollments.length, envInt('ABUSE_WARN_PUBLIC_ENROLLMENTS_PER_HOUR', 25), 'Unexpected signup spikes may indicate abuse or bot traffic.'),
    signal('challenge_failures', 'Turnstile challenge failures', failedChallenges.length, envInt('ABUSE_WARN_CHALLENGE_FAILURES_PER_HOUR', 20), 'Repeated failed challenges indicate bot pressure or broken Turnstile config.'),
    signal('email_delivery_failures', 'Enrollment email delivery failures', deliveryFailures.length, envInt('ABUSE_WARN_EMAIL_FAILURES_PER_HOUR', 5), 'Delivery failures can strand legitimate volunteers or indicate provider/rate-limit issues.'),
    signal('node_registrations', 'Node registration volume', registrations.length, envInt('ABUSE_WARN_NODE_REGISTRATIONS_PER_HOUR', 20), 'Unexpected registration spikes may require enrollment pause or node review.'),
    signal('work_claims', 'Work claim volume', claims.length, envInt('ABUSE_WARN_WORK_CLAIMS_PER_HOUR', 500), 'High claim volume can indicate runaway workers or coordinated load.'),
    signal('work_submissions', 'Work submission volume', submissions.length, envInt('ABUSE_WARN_WORK_SUBMISSIONS_PER_HOUR', 500), 'High submission volume should be checked against queue and consensus quality.'),
    signal('validation_failures', 'Submission validation failures', validationFailures.length, envInt('ABUSE_WARN_VALIDATION_FAILURES_PER_HOUR', 20), 'Repeated malformed submissions may indicate bad builds, prompt drift, or malicious clients.'),
    signal('node_revocations_or_suspensions', 'Node suspensions/revocations', revokedOrSuspended.length, envInt('ABUSE_WARN_NODE_ENFORCEMENTS_PER_HOUR', 5), 'Frequent enforcement actions suggest launch or abuse pressure.')
  ];

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes,
    signals,
    alertingConfigured: Boolean(process.env.ABUSE_ALERT_WEBHOOK_URL || process.env.ABUSE_ALERT_EMAIL_TO)
  };
}

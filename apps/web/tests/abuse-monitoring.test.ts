import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { abuseMonitoringSnapshot } from '../lib/abuse-monitoring';

function dbWithEvents(actions: string[]): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
    ingestionRuns: [],
    volunteerEnrollments: [],
    auditEvents: actions.map((action, index) => ({
      id: `event-${index}`,
      actorType: 'system' as const,
      action,
      metadata: action === 'work.submit.completed' ? { validationErrors: index % 2 } : {},
      createdAt: new Date().toISOString()
    })),
    workerControl: {
      paused: false,
      idleMode: 'user-and-cpu',
      minIdleSeconds: 120,
      maxCpuPercent: 35,
      runNowToken: 0,
      updatedAt: new Date().toISOString()
    }
  };
}

describe('abuse monitoring snapshot', () => {
  it('summarizes enrollment and challenge pressure from audit events', () => {
    const oldEnv = { ...process.env };
    process.env.ABUSE_WARN_PUBLIC_ENROLLMENTS_PER_HOUR = '2';
    process.env.ABUSE_WARN_CHALLENGE_FAILURES_PER_HOUR = '1';

    try {
      const snapshot = abuseMonitoringSnapshot(dbWithEvents([
        'volunteer_enrollment.issued',
        'volunteer_enrollment.issued',
        'volunteer_enrollment.challenge_failed'
      ]));
      expect(snapshot.signals.find((signal) => signal.id === 'public_enrollments')).toMatchObject({ count: 2, severity: 'warn' });
      expect(snapshot.signals.find((signal) => signal.id === 'challenge_failures')).toMatchObject({ count: 1, severity: 'warn' });
    } finally {
      process.env = oldEnv;
    }
  });

  it('reports alerting configuration when webhook or email env is present', () => {
    const oldEnv = { ...process.env };
    process.env.ABUSE_ALERT_WEBHOOK_URL = 'https://example.com/hook';

    try {
      expect(abuseMonitoringSnapshot(dbWithEvents([])).alertingConfigured).toBe(true);
    } finally {
      process.env = oldEnv;
    }
  });
});

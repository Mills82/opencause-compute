import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import { publicLaunchReadiness } from '../lib/readiness/public-launch';

function emptyDb(): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
    ingestionRuns: [],
    auditEvents: [],
    volunteerEnrollments: [],
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

describe('public launch readiness', () => {
  it('does not treat public volunteer enrollment as configured without email delivery', () => {
    const oldEnv = { ...process.env };
    process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT = 'true';
    process.env.TURNSTILE_SITE_KEY = 'site';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    delete process.env.RESEND_API_KEY;
    delete process.env.ENROLLMENT_EMAIL_FROM;

    try {
      const readiness = publicLaunchReadiness(emptyDb());
      const enrollment = readiness.items.find((item) => item.id === 'volunteer_enrollment');
      expect(enrollment?.status).toBe('fail');
      expect(enrollment?.detail).toContain('email delivery');
    } finally {
      process.env = oldEnv;
    }
  });

  it('recognizes Turnstile plus email as a public beta enrollment candidate', () => {
    const oldEnv = { ...process.env };
    process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT = 'true';
    process.env.TURNSTILE_SITE_KEY = 'site';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.RESEND_API_KEY = 'resend';
    process.env.ENROLLMENT_EMAIL_FROM = 'OpenCause <hello@example.com>';

    try {
      const readiness = publicLaunchReadiness(emptyDb());
      const enrollment = readiness.items.find((item) => item.id === 'volunteer_enrollment');
      expect(enrollment?.status).toBe('warn');
      expect(enrollment?.detail).toContain('email delivery');
    } finally {
      process.env = oldEnv;
    }
  });
});

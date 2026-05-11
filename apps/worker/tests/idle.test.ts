import { afterEach, describe, expect, it } from 'vitest';
import { decideContinueEligibility, decideIdleEligibility, type IdleConfig } from '../src/idle';

const config: IdleConfig = {
  mode: 'user-and-cpu',
  minIdleSeconds: 120,
  maxCpuPercent: 35,
  sampleMs: 200
};

describe('idle policy', () => {
  it('allows processing when cpu and user idle thresholds pass', () => {
    const decision = decideIdleEligibility(
      {
        cpuPercent: 12,
        userIdleSeconds: 200
      },
      config
    );

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('ok');
  });

  it('blocks when cpu is high', () => {
    const decision = decideIdleEligibility(
      {
        cpuPercent: 90,
        userIdleSeconds: 999
      },
      config
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('high_cpu');
  });

  it('does not let high cpu mask recent user activity in user-and-cpu mode', () => {
    const decision = decideIdleEligibility(
      {
        cpuPercent: 90,
        userIdleSeconds: 10
      },
      config
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('user_not_idle');
  });

  it('blocks when user idle is unavailable in user-and-cpu mode', () => {
    const decision = decideIdleEligibility(
      {
        cpuPercent: 10,
        userIdleSeconds: null
      },
      config
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('user_idle_unavailable');
  });

  it('allows cpu-only mode without user idle metric', () => {
    const decision = decideIdleEligibility(
      {
        cpuPercent: 20,
        userIdleSeconds: null
      },
      {
        ...config,
        mode: 'cpu-only'
      }
    );

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('ok');
  });
});

describe('active packet continuation policy', () => {
  it('ignores high cpu while continuing an already claimed packet', () => {
    const decision = decideContinueEligibility(
      {
        cpuPercent: 95,
        userIdleSeconds: 999
      },
      config
    );

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('ok');
  });

  it('still interrupts active packet work when the user returns', () => {
    const decision = decideContinueEligibility(
      {
        cpuPercent: 20,
        userIdleSeconds: 5
      },
      config
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('user_not_idle');
  });
});

describe('battery policy', () => {
  const oldEnv = { ...process.env };
  afterEach(() => { process.env = { ...oldEnv }; });

  it('blocks work when battery policy disallows battery power', async () => {
    const { checkBatteryPolicy } = await import('../src/idle');
    process.env.FORCE_ON_BATTERY = 'true';
    const decision = await checkBatteryPolicy(false);
    expect(decision?.eligible).toBe(false);
    expect(decision?.reason).toBe('on_battery');
  });
});

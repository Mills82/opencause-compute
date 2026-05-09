import { describe, expect, it } from 'vitest';
import { defaultDesktopSettings } from '../src/settings';
import { buildDesktopViewModel, publicLaunchUiReady } from '../src/view-model';

describe('desktop view model', () => {
  const runtime = {
    configured: true,
    running: false,
    appDir: '/tmp/opencause',
    logPath: '/tmp/opencause/worker.log',
    credentialsPath: '/tmp/opencause/node.json'
  };

  it('blocks launch UI until disclaimer, enrollment, and runtime are ready', () => {
    const vm = buildDesktopViewModel({
      settings: defaultDesktopSettings,
      runtime,
      disclaimerAccepted: false,
      runtimeAvailable: false,
      publicEnrollmentEnabled: false
    });

    expect(vm.filter((screen) => screen.status === 'blocked').map((screen) => screen.id)).toEqual([
      'welcome',
      'enrollment',
      'runtime-check'
    ]);
    expect(publicLaunchUiReady(vm)).toBe(false);
  });

  it('becomes UI-ready once registered, accepted, and runtime available', () => {
    const vm = buildDesktopViewModel({
      settings: { ...defaultDesktopSettings, nodeId: 'node-1' },
      runtime: { ...runtime, running: true, pid: 123 },
      disclaimerAccepted: true,
      runtimeAvailable: true,
      publicEnrollmentEnabled: true
    });

    expect(publicLaunchUiReady(vm)).toBe(true);
    expect(vm.find((screen) => screen.id === 'activity')?.message).toContain('123');
  });
});

import { describe, expect, it } from 'vitest';
import { desktopScreens, packagePlan, packagingTargets, publicLaunchDesktopReady } from '../src/index';

describe('desktop launch plan', () => {
  it('tracks required public volunteer desktop screens', () => {
    expect(desktopScreens.map((screen) => screen.id)).toEqual([
      'welcome',
      'enrollment',
      'runtime-check',
      'activity',
      'resource-controls',
      'pause-resume',
      'uninstall-help'
    ]);
    expect(desktopScreens.every((screen) => screen.publicLaunchRequired)).toBe(true);
  });

  it('does not claim public desktop readiness before a signed Windows target is ready', () => {
    expect(packagingTargets.find((target) => target.platform === 'windows')?.status).toBe('planned');
    expect(publicLaunchDesktopReady()).toBe(false);
    expect(packagePlan().ready).toBe(false);
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultDesktopSettings, loadDesktopSettings, redactedSettings, settingsPath, updateDesktopSettings } from '../src/settings';

describe('desktop settings', () => {
  it('uses safe defaults for public volunteer workers', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'occ-desktop-'));
    try {
      const settings = await loadDesktopSettings(dir);
      expect(settings.coordinatorUrl).toBe('https://opencause.appassist.ai');
      expect(settings.localPaused).toBe(false);
      expect(settings.resourceControls.runOnBattery).toBe(false);
      expect(settings.resourceControls.schedule).toBe('idle-only');
      expect(settings.modelRuntime.endpointType).toBe('localhost');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('persists nested updates', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'occ-desktop-'));
    try {
      await updateDesktopSettings(dir, { localPaused: true, resourceControls: { maxCpuPercent: 20 } });
      const settings = await loadDesktopSettings(dir);
      expect(settings.localPaused).toBe(true);
      expect(settings.resourceControls.maxCpuPercent).toBe(20);
      expect(settings.resourceControls.minIdleSeconds).toBe(defaultDesktopSettings.resourceControls.minIdleSeconds);
      expect(settingsPath(dir)).toContain('desktop-settings.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('redacts enrollment code and node token for UI/status display', () => {
    const redacted = redactedSettings({ ...defaultDesktopSettings, enrollmentCode: 'occ_secret', nodeToken: 'token_secret' });
    expect(redacted.enrollmentCode).toBe('[redacted]');
    expect(redacted.nodeToken).toBe('[redacted]');
  });
});

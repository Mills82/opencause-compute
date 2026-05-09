import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('electron-builder packaging config', () => {
  const config = JSON.parse(readFileSync(new URL('../electron-builder.json', import.meta.url), 'utf8'));

  it('defines a Windows installer target but keeps signing disabled until certs exist', () => {
    expect(config.productName).toBe('OpenCause Compute Worker');
    expect(config.win.target[0].target).toBe('nsis');
    expect(config.win.signAndEditExecutable).toBe(false);
  });

  it('bundles built desktop files and worker runtime output', () => {
    expect(config.files).toContain('dist/**/*');
    expect(config.extraResources[0]).toMatchObject({ from: '../worker/dist', to: 'worker/dist' });
  });

  it('uses an installer shape suitable for non-developer Windows volunteers', () => {
    expect(config.nsis.oneClick).toBe(false);
    expect(config.nsis.allowToChangeInstallationDirectory).toBe(true);
    expect(config.nsis.createDesktopShortcut).toBe(true);
    expect(config.nsis.createStartMenuShortcut).toBe(true);
  });
});

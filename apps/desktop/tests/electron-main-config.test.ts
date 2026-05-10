import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('electron main window config', () => {
  const source = readFileSync(new URL('../src/electron-main.ts', import.meta.url), 'utf8');

  it('keeps the packaged preload bridge available with context isolation', () => {
    expect(source).toContain('contextIsolation: true');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('sandbox: false');
    expect(source).toContain("preload: path.join(__dirname, 'electron-preload.js')");
  });

  it('uses a dashboard-sized window and custom desktop menus', () => {
    expect(source).toContain('width: 1180');
    expect(source).toContain('height: 820');
    expect(source).toContain('minWidth: 980');
    expect(source).toContain('installApplicationMenu');
    expect(source).toContain('Fit Dashboard');
    expect(source).toContain('Hide to Tray');
    expect(source).toContain('OpenCause Compute Website');
  });

  it('stops the active worker before replacing cached supervisor settings', () => {
    expect(source).toContain('const previousSupervisor = cachedSupervisor');
    expect(source).toContain('previousSupervisor?.stop()');
    expect(source.indexOf('previousSupervisor?.stop()')).toBeLessThan(source.indexOf('cachedSupervisor = null'));
  });
});

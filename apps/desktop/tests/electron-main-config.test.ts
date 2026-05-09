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
});

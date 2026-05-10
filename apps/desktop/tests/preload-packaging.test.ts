import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sandboxed preload packaging', () => {
  it('ships a CommonJS preload for Electron sandbox compatibility', () => {
    const preload = readFileSync(resolve(process.cwd(), 'src/electron-preload.cjs'), 'utf8');
    expect(preload).toContain("require('electron')");
    expect(preload).toContain('contextBridge.exposeInMainWorld');
    expect(preload).not.toContain("import { contextBridge");
  });

  it('copies the CommonJS preload during desktop build', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/copy-static.mjs'), 'utf8');
    expect(script).toContain('electron-preload.cjs');
  });
});

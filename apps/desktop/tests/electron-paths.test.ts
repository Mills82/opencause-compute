import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('electron packaged paths', () => {
  it('copies static first-run UI under dist/static where electron-main loads it', () => {
    const expected = path.resolve('dist/static/index.html');
    expect(existsSync(expected)).toBe(true);
  });
});

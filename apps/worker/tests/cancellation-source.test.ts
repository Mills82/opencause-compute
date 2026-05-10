import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('in-flight cancellation source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
  it('releases, not fails, claims cancelled by resource policy', () => {
    expect(source).toContain("reason.startsWith('cancelled:')");
    expect(source).toContain("'released'");
    expect(source).toContain('checkBatteryPolicy(runOnBatteryAllowed())');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('claimed work lifecycle safeguards', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

  it('fails claimed work on invalid packet signatures', () => {
    expect(source).toContain("invalid_packet_signature', 'failed'");
  });

  it('releases claimed work on post-claim idle/resource blocks', () => {
    expect(source).toContain("beforeExtractIdleDecision.reason, 'released'");
    expect(source).toContain("'/api/work/release'");
  });
});

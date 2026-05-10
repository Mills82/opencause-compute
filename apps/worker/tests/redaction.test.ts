import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../src/redaction';

describe('worker redaction', () => {
  it('redacts token URLs and credential-shaped data', () => {
    const output = redactSensitive('profile https://x/volunteer/profile?token=abc123 {"nodeToken":"tok"} --enrollment-code occ_secret999');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('\"tok\"');
    expect(output).not.toContain('occ_secret999');
  });
});

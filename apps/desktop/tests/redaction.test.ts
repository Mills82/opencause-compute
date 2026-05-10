import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../src/redaction';

describe('desktop redaction', () => {
  it('redacts tokens, enrollment codes, setup URLs, and auth headers', () => {
    const input = 'occ_secret123 /volunteer/profile?token=profile-secret {"nodeToken":"node-secret","profileSetupToken":"profile-secret"} x-node-token: node-secret Authorization: Bearer admin-secret --node-token node-secret';
    const output = redactSensitive(input);
    expect(output).not.toContain('occ_secret123');
    expect(output).not.toContain('profile-secret');
    expect(output).not.toContain('node-secret');
    expect(output).not.toContain('admin-secret');
    expect(output).toContain('token=[redacted]');
  });
});

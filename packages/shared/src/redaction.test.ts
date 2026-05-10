import { describe, expect, it } from 'vitest';
import { redactSensitive } from './redaction';

describe('shared redaction', () => {
  it('redacts credential-shaped values consistently', () => {
    const output = redactSensitive('occ_secret123 ?token=profile-secret {"nodeToken":"node-secret"} Authorization: Bearer admin-secret --node-token node-secret');
    expect(output).not.toContain('occ_secret123');
    expect(output).not.toContain('profile-secret');
    expect(output).not.toContain('node-secret');
    expect(output).not.toContain('admin-secret');
  });
});

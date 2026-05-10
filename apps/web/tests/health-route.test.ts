import { describe, expect, it } from 'vitest';
import { GET as publicHealth } from '../app/api/health/route';

describe('health routes', () => {
  it('public health is minimal and non-sensitive', async () => {
    const response = await publicHealth(new Request('http://localhost/api/health'));
    const json = await response.json();
    expect(json).toEqual({ ok: true, app: 'opencause-compute' });
    expect(json).not.toHaveProperty('commit');
    expect(json).not.toHaveProperty('envValidation');
    expect(json).not.toHaveProperty('counts');
    expect(json).not.toHaveProperty('signingDiagnostics');
  });
});

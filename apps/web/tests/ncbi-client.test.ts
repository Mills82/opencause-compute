import { describe, expect, it } from 'vitest';
import { appendNcbiParams, ncbiDelayMs } from '../lib/ingestion/ncbi-client';

describe('ncbi client helpers', () => {
  it('adds tool, email, and api key params without exposing secrets elsewhere', () => {
    const params = appendNcbiParams(new URLSearchParams({ db: 'pubmed' }), {
      email: 'research@example.com',
      apiKey: 'key123',
      tool: 'opencause-test'
    });

    expect(params.get('tool')).toBe('opencause-test');
    expect(params.get('email')).toBe('research@example.com');
    expect(params.get('api_key')).toBe('key123');
  });

  it('uses conservative delay without api key and faster delay with api key', () => {
    expect(ncbiDelayMs({})).toBeGreaterThanOrEqual(333);
    expect(ncbiDelayMs({ apiKey: 'key' })).toBeLessThan(333);
    expect(ncbiDelayMs({ requestDelayMs: 999 })).toBe(999);
  });
});

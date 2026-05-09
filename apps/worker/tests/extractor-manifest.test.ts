import { describe, expect, it } from 'vitest';
import { assertApprovedExtractor, assertLocalhostEndpoint, assertPathInside } from '../src/extractor-manifest';

describe('extractor manifest safety', () => {
  it('allows approved local llm extractor', () => {
    expect(assertApprovedExtractor('local-llm', { allowMock: false }).id).toBe('local-llm-v1');
  });

  it('rejects mock extractor unless explicitly allowed', () => {
    expect(() => assertApprovedExtractor('mock', { allowMock: false })).toThrow('extractor_not_approved');
    expect(assertApprovedExtractor('mock', { allowMock: true }).id).toBe('mock-extractor-v1');
  });

  it('requires local llm endpoint to be localhost', () => {
    expect(() => assertLocalhostEndpoint('http://127.0.0.1:11434')).not.toThrow();
    expect(() => assertLocalhostEndpoint('https://example.com')).toThrow('local_llm_endpoint_must_be_localhost');
  });

  it('rejects paths outside app dir', () => {
    expect(() => assertPathInside('/tmp/app', '/tmp/app/worker.log')).not.toThrow();
    expect(() => assertPathInside('/tmp/app', '/tmp/other/secret')).toThrow('path_outside_app_dir');
  });
});

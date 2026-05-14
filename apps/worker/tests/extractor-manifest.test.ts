import { describe, expect, it } from 'vitest';
import { assertApprovedExtractor, assertLocalhostEndpoint, assertPathInside } from '../src/extractor-manifest';

describe('extractor manifest safety', () => {
  it('allows only approved local llm claims-v2 extractor', () => {
    expect(assertApprovedExtractor('local-llm').id).toBe('local-llm-v2');
    expect(() => assertApprovedExtractor('mock')).toThrow('extractor_not_approved');
  });

  it('requires local llm endpoint to be localhost', () => {
    expect(() => assertLocalhostEndpoint('http://127.0.0.1:11434')).not.toThrow();
    expect(() => assertLocalhostEndpoint('https://example.com')).toThrow('local_llm_endpoint_must_be_localhost');
  });

  it('rejects paths outside app dir', () => {
    expect(() => assertPathInside('/tmp/app', '/tmp/app/log.txt')).not.toThrow();
    expect(() => assertPathInside('/tmp/app', '/tmp/evil.txt')).toThrow('unsafe_path_outside_app_dir');
  });
});

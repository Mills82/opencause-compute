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

  it('accepts POSIX paths inside the app dir and rejects siblings/parents', () => {
    expect(() => assertPathInside('/tmp/app', '/tmp/app/worker.log')).not.toThrow();
    expect(() => assertPathInside('/tmp/app', '/tmp/app/nested/node.json')).not.toThrow();
    expect(() => assertPathInside('/tmp/app', '/tmp/app-evil/worker.log')).toThrow('unsafe_path_outside_app_dir');
    expect(() => assertPathInside('/tmp/app', '/tmp/evil.txt')).toThrow('unsafe_path_outside_app_dir');
    expect(() => assertPathInside('/tmp/app', '/tmp/app')).toThrow('unsafe_path_outside_app_dir');
  });

  it('accepts Windows paths inside the app dir and rejects siblings/parents', () => {
    const appDir = 'C:\\Users\\Matt\\.opencause-compute';
    expect(() => assertPathInside(appDir, 'C:\\Users\\Matt\\.opencause-compute\\worker.log')).not.toThrow();
    expect(() => assertPathInside(appDir, 'C:\\Users\\Matt\\.opencause-compute\\node.json')).not.toThrow();
    expect(() => assertPathInside(appDir, 'C:\\Users\\Matt\\.opencause-compute\\packet-failures.json')).not.toThrow();
    expect(() => assertPathInside(appDir, 'C:\\Users\\Matt\\.opencause-compute-evil\\worker.log')).toThrow('unsafe_path_outside_app_dir');
    expect(() => assertPathInside(appDir, 'C:\\Users\\Matt\\worker.log')).toThrow('unsafe_path_outside_app_dir');
    expect(() => assertPathInside(appDir, 'D:\\Users\\Matt\\.opencause-compute\\worker.log')).toThrow('unsafe_path_outside_app_dir');
  });

  it('confirms Windows APP_DIR derived worker paths pass safety checks', () => {
    const APP_DIR = 'C:\\Users\\Matt\\.opencause-compute';
    const LOG_PATH = 'C:\\Users\\Matt\\.opencause-compute\\worker.log';
    const NODE_PATH = 'C:\\Users\\Matt\\.opencause-compute\\node.json';
    const FAILURE_ATTEMPTS_PATH = 'C:\\Users\\Matt\\.opencause-compute\\packet-failures.json';
    expect(() => assertPathInside(APP_DIR, LOG_PATH)).not.toThrow();
    expect(() => assertPathInside(APP_DIR, NODE_PATH)).not.toThrow();
    expect(() => assertPathInside(APP_DIR, FAILURE_ATTEMPTS_PATH)).not.toThrow();
  });
});

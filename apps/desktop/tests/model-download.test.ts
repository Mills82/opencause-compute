import { describe, expect, it } from 'vitest';
import { modelDownloadStatus, startOllamaModelDownload } from '../src/model-runtime';

describe('model download state', () => {
  it('rejects unapproved model downloads before spawning Ollama', () => {
    expect(() => startOllamaModelDownload('not-approved:latest')).toThrow('model_not_approved');
  });

  it('returns null for unknown download ids', () => {
    expect(modelDownloadStatus('missing')).toBeNull();
  });
});

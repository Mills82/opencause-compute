import { describe, expect, it } from 'vitest';
import { provenanceWeight } from '../lib/consensus-scoring';

describe('provenanceWeight', () => {
  it('gives higher but capped weight to ultra deterministic high-context results', () => {
    expect(provenanceWeight({
      extractorVersion: 'Local LLM v2',
      generationQualityTier: 'ultra',
      generationOptions: { temperature: 0, num_ctx: 12288 },
      workerPlatform: 'test',
      promptVersion: 'test',
      promptHash: 'hash'
    })).toBeGreaterThan(1.2);
  });

  it('keeps mock and low-quality results below balanced weight', () => {
    expect(provenanceWeight({ extractorVersion: 'Local LLM v2', generationQualityTier: 'low', workerPlatform: 'test', promptVersion: 'test', promptHash: 'hash' })).toBeLessThan(1);
  });
});

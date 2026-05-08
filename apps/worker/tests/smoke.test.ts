import { describe, expect, it } from 'vitest';
import { runMockExtractorV1 } from '@opencause/shared';

describe('worker smoke', () => {
  it('can produce extractor output locally', () => {
    const result = runMockExtractorV1('Breast cancer cohort studied trastuzumab and showed response.');
    expect(result.facts.length).toBe(1);
  });
});

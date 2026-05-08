import { describe, expect, it } from 'vitest';
import { runMockExtractorV1 } from './extractor.js';

describe('mock extractor', () => {
  it('produces deterministic output for same input', () => {
    const text = 'In NSCLC, EGFR patients showed response to osimertinib in a phase 3 trial.';
    const first = runMockExtractorV1(text);
    const second = runMockExtractorV1(text);

    expect(first).toEqual(second);
    expect(first.facts[0]?.relationshipType).toBe('associated_with_response');
  });
});

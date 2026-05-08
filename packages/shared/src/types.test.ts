import { describe, expect, it } from 'vitest';
import { relationshipTypeSchema, resultPayloadSchema } from './types.js';

describe('schema validation', () => {
  it('accepts relationship enum values', () => {
    expect(relationshipTypeSchema.parse('associated_with_response')).toBe('associated_with_response');
  });

  it('rejects invalid relationship enum values', () => {
    expect(() => relationshipTypeSchema.parse('invalid')).toThrow();
  });

  it('validates result payload shape', () => {
    const parsed = resultPayloadSchema.parse({
      facts: [
        {
          relationshipType: 'studied_with',
          evidenceSentence: 'A trial studied EGFR with osimertinib.',
          confidence: 0.7
        }
      ],
      summary: 'ok',
      warnings: []
    });

    expect(parsed.facts).toHaveLength(1);
  });
});

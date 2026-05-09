import { describe, expect, it } from 'vitest';
import { extractJsonBlock, normalizeLocalLlmPayload } from '../src/local-llm';

describe('local llm helpers', () => {
  it('extracts json object from plain model output', () => {
    const raw = '{"facts":[],"summary":"ok","warnings":[]}';
    expect(extractJsonBlock(raw)).toBe(raw);
  });

  it('extracts json object from wrapped output', () => {
    const raw = '```json\n{"facts":[],"summary":"ok","warnings":[]}\n```';
    expect(extractJsonBlock(raw)).toBe('{"facts":[],"summary":"ok","warnings":[]}');
  });

  it('throws when json is missing', () => {
    expect(() => extractJsonBlock('no json here')).toThrowError('local_llm_invalid_json');
  });

  it('normalizes nullable and missing local model fields', () => {
    const normalized = normalizeLocalLlmPayload({
      facts: [{ drugOrCompound: null, relationshipType: 'associated with response', evidenceSentence: null, confidence: '0.7' }]
    });
    expect(normalized.summary).toContain('Extracted 1 candidate fact');
    expect(normalized.warnings).toContain('local_model_missing_warnings_array');
    expect(normalized.facts[0].relationshipType).toBe('unclear');
    expect(normalized.facts[0].drugOrCompound).toBeUndefined();
    expect(normalized.facts[0].confidence).toBe(0.7);
  });
});

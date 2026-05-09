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
    expect(normalized.summary).toContain('No candidate facts extracted');
    expect(normalized.warnings).toContain('local_model_missing_warnings_array');
    expect(normalized.warnings).toContain('local_model_returned_no_facts');
    expect(normalized.facts).toHaveLength(0);
  });

  it('keeps facts with exact source evidence', () => {
    const evidenceSentence = 'Responses to atezolizumab appear durable in metastatic triple-negative breast cancer.';
    const normalized = normalizeLocalLlmPayload({
      facts: [{ drugOrCompound: null, relationshipType: 'associated_with_response', evidenceSentence, confidence: '0.7' }],
      summary: 'ok',
      warnings: []
    }, evidenceSentence);
    expect(normalized.facts[0].relationshipType).toBe('associated_with_response');
    expect(normalized.facts[0].drugOrCompound).toBeUndefined();
    expect(normalized.facts[0].confidence).toBe(0.7);
  });
});

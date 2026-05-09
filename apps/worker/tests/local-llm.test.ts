import { describe, expect, it } from 'vitest';
import { extractJsonBlock } from '../src/local-llm';

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
});

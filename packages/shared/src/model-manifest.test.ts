import { describe, expect, it } from 'vitest';
import { CANDIDATE_LOCAL_MODELS, DEFAULT_LOCAL_MODEL, approvedModel, assertApprovedModel, candidateModel } from './model-manifest';

describe('model manifest', () => {
  it('uses qwen3:14b as public default', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('qwen3:14b');
    expect(approvedModel(DEFAULT_LOCAL_MODEL)?.publicDefault).toBe(true);
  });

  it('does not approve the lower-quality 3b model', () => {
    expect(approvedModel('llama3.2:3b')).toBeUndefined();
    expect(() => assertApprovedModel('llama3.2:3b')).toThrow('model_not_approved:llama3.2:3b');
  });

  it('lists local-test candidates without approving them', () => {
    expect(CANDIDATE_LOCAL_MODELS.map((model) => model.id)).toContain('medgemma:4b');
    expect(CANDIDATE_LOCAL_MODELS.map((model) => model.id)).not.toContain('qwen3:4b');
    expect(CANDIDATE_LOCAL_MODELS.map((model) => model.id)).not.toContain('gemma3:4b-it-qat');
    const candidateIds = CANDIDATE_LOCAL_MODELS.map((model) => model.id);
    expect(candidateIds).not.toContain('gemma3:12b-it-qat');
    expect(candidateIds).not.toContain('gpt-oss:20b');
    expect(candidateIds).toContain('gemma4:26b');
    expect(candidateIds).toContain('qwen3.6:27b');
    expect(candidateIds).toContain('medgemma:27b');
    expect(candidateIds).toContain('qwen3.6:35b');
    expect(candidateIds).toContain('llama3.3:70b');
    expect(approvedModel('medgemma1.5:4b')).toBeUndefined();
    expect(candidateModel('medgemma1.5:4b')).toBeUndefined();
    expect(() => assertApprovedModel('medgemma1.5:4b')).toThrow('model_not_approved:medgemma1.5:4b');
  });

  it('allows default model without advanced flags', () => {
    expect(assertApprovedModel('qwen3:14b').tier).toBe('default');
  });

  it('keeps removed legacy large and experimental models unapproved', () => {
    expect(() => assertApprovedModel('llama3.3:70b')).toThrow('model_not_approved:llama3.3:70b');
    expect(assertApprovedModel('llama3.3:70b', { allowCandidate: true }).tier).toBe('high_end');
    expect(() => assertApprovedModel('llama4:scout')).toThrow('model_not_approved:llama4:scout');
  });
});

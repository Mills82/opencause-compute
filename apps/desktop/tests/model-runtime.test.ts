import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL } from '@opencause/shared';
import { pullOllamaModel } from '../src/model-runtime';

describe('desktop model runtime', () => {
  it('defaults to approved public model', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('qwen3:14b');
  });

  it('rejects unapproved model pulls', async () => {
    await expect(pullOllamaModel('unknown:model')).rejects.toThrow('model_not_approved');
  });

  it('requires advanced confirmation for candidate pulls', async () => {
    await expect(pullOllamaModel('gemma4:26b')).rejects.toThrow('candidate_model_requires_advanced_confirmation');
  });

  it('allows advanced candidate pulls after explicit desktop confirmation', async () => {
    await expect(pullOllamaModel('gemma4:26b', true)).rejects.not.toThrow('candidate_model_requires_advanced_confirmation');
  });
});

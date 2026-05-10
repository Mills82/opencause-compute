import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL } from '@opencause/shared';
import { pullOllamaModel } from '../src/model-runtime';

describe('desktop model runtime', () => {
  it('defaults to approved public model', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('llama3.2:3b');
  });

  it('rejects unapproved model pulls', async () => {
    await expect(pullOllamaModel('unknown:model')).rejects.toThrow('model_not_approved');
  });

  it('requires advanced confirmation for large or experimental pulls', async () => {
    await expect(pullOllamaModel('llama3.3:70b')).rejects.toThrow('large_model_requires_advanced_confirmation');
    await expect(pullOllamaModel('llama4:scout')).rejects.toThrow('experimental_model_requires_advanced_confirmation');
  });

  it('allows advanced pulls after explicit desktop confirmation', async () => {
    await expect(pullOllamaModel('llama3.3:70b', true)).rejects.not.toThrow('large_model_requires_advanced_confirmation');
  });
});

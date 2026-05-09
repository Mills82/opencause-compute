import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL } from '@opencause/shared';
import { pullOllamaModel } from '../src/model-runtime';

describe('desktop model runtime', () => {
  it('defaults to approved public model', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('llama3.2:3b');
  });

  it('rejects unapproved model pulls', async () => {
    await expect(() => pullOllamaModel('unknown:model')).toThrow('model_not_approved');
  });

  it('requires advanced confirmation for large or experimental pulls', async () => {
    await expect(() => pullOllamaModel('llama3.3:70b')).toThrow('large_model_requires_advanced_confirmation');
    await expect(() => pullOllamaModel('llama4:scout')).toThrow('experimental_model_requires_advanced_confirmation');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL, approvedModel, assertApprovedModel } from './model-manifest';

describe('model manifest', () => {
  it('uses llama3.2:3b as public default', () => {
    expect(DEFAULT_LOCAL_MODEL).toBe('llama3.2:3b');
    expect(approvedModel(DEFAULT_LOCAL_MODEL)?.publicDefault).toBe(true);
  });

  it('allows stronger 8b model without advanced flags', () => {
    expect(assertApprovedModel('llama3.1:8b').tier).toBe('stronger');
  });

  it('requires opt-in for large and experimental models', () => {
    expect(() => assertApprovedModel('llama3.3:70b')).toThrow('large_model_requires_opt_in');
    expect(() => assertApprovedModel('llama4:scout')).toThrow('experimental_model_requires_opt_in');
    expect(assertApprovedModel('llama3.3:70b', { allowLarge: true }).tier).toBe('large');
    expect(assertApprovedModel('llama4:scout', { allowExperimental: true }).tier).toBe('experimental');
  });
});

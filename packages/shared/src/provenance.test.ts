import { describe, expect, it } from 'vitest';
import { resultProvenanceSchema } from './types.js';

const baseProvenance = {
  workerVersion: '0.1.0',
  extractorVersion: 'Local LLM v2',
  modelName: 'llama3.2:3b',
  modelProvider: 'ollama',
  promptVersion: 'local-llm-v2-lite-prompt-2026-05-11',
  promptHash: 'hash',
  packetSchemaVersion: 'work-packet-v1',
  extractionTimestamp: new Date().toISOString(),
  workerPlatform: 'win32-x64',
  workerCapabilities: ['local-llm-v2'],
  resultValidationVersion: 'claims-v2'
};

describe('result provenance schema', () => {
  it('preserves explicit worker triage provenance fields', () => {
    const parsed = resultProvenanceSchema.parse({
      ...baseProvenance,
      resultKind: 'triage_skip',
      extractionAttempted: false,
      packetTriage: {
        schemaVersion: 'packet-triage-v1',
        decision: 'skip_non_cancer',
        cancerRelevance: 0,
        claimOpportunity: 0.1,
        reason: 'No cancer-relevance terms found in packet.',
        suggestedNoClaimReason: 'no_cancer_claim',
        warnings: []
      }
    });

    expect(parsed.resultKind).toBe('triage_skip');
    expect(parsed.extractionAttempted).toBe(false);
    expect(parsed.packetTriage?.decision).toBe('skip_non_cancer');
  });

  it('rejects invalid triage decisions in provenance', () => {
    expect(() => resultProvenanceSchema.parse({
      ...baseProvenance,
      resultKind: 'triage_skip',
      extractionAttempted: false,
      packetTriage: {
        schemaVersion: 'packet-triage-v1',
        decision: 'skip_everything',
        cancerRelevance: 0,
        claimOpportunity: 0,
        reason: 'bad',
        warnings: []
      }
    })).toThrow();
  });
});

import type { ResultPayload, WorkPacketPayload } from './types.js';

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateResultForPacket(payload: ResultPayload, packet: WorkPacketPayload): ValidationResult {
  const errors: string[] = [];
  for (const [index, claim] of payload.claims.entries()) {
    if (!packet.sourceText.includes(claim.exactEvidenceSentence)) {
      errors.push(`claims[${index}].exactEvidenceSentence must appear in source text`);
    }
    if (claim.evidenceContext && !packet.sourceText.includes(claim.evidenceContext)) {
      errors.push(`claims[${index}].evidenceContext must appear in source text`);
    }
  }
  return { valid: errors.length === 0, errors, warnings: payload.warnings };
}

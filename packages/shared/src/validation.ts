import { resultPayloadSchema, type ResultPayload, type WorkPacketPayload } from './types.js';

export type ValidationOutcome = {
  valid: boolean;
  errors: string[];
};

export function validateResultForPacket(result: unknown, packet: WorkPacketPayload): ValidationOutcome {
  const parsed = resultPayloadSchema.safeParse(result);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'result'}: ${issue.message}`)
    };
  }

  const payload: ResultPayload = parsed.data;
  const errors: string[] = [];

  if ('facts' in payload) {
    for (const [index, fact] of payload.facts.entries()) {
      if (!packet.sourceText.includes(fact.evidenceSentence)) {
        errors.push(`facts[${index}].evidenceSentence must appear in source text`);
      }
    }
  } else {
    for (const [index, claim] of payload.claims.entries()) {
      if (!packet.sourceText.includes(claim.exactEvidenceSentence)) {
        errors.push(`claims[${index}].exactEvidenceSentence must appear in source text`);
      }
      if (claim.evidenceContext && !packet.sourceText.includes(claim.evidenceContext)) {
        errors.push(`claims[${index}].evidenceContext must appear in source text`);
      }
      // Character offsets are optional locator metadata from local models. The
      // evidence sentence/context checks above are the authoritative structure
      // guardrails; bad offsets should be ignored by normalizers, not turn an
      // otherwise citation-backed claim into a rejected submission.
    }
    if (payload.claims.length === 0 && !payload.noClaimReason) {
      errors.push('noClaimReason is required when claims is empty');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

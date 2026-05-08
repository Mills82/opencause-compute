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

  for (const [index, fact] of payload.facts.entries()) {
    if (!packet.sourceText.includes(fact.evidenceSentence)) {
      errors.push(`facts[${index}].evidenceSentence must appear in source text`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

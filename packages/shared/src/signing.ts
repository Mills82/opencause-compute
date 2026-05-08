import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function canonicalizeForSignature(payload: unknown): string {
  return stableStringify(payload);
}

export function signPayloadHmac(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(canonicalizeForSignature(payload)).digest('hex');
}

export function verifyPayloadHmac(payload: unknown, signature: string, secret: string): boolean {
  const expected = Buffer.from(signPayloadHmac(payload, secret), 'hex');
  const got = Buffer.from(signature, 'hex');
  if (expected.length !== got.length) {
    return false;
  }
  return timingSafeEqual(expected, got);
}

export function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashJson(input: unknown): string {
  return createHash('sha256').update(canonicalizeForSignature(input)).digest('hex');
}

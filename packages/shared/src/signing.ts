import { createHash, createHmac, createPrivateKey, createPublicKey, sign, timingSafeEqual, verify } from 'node:crypto';

function normalizeSigningKey(value: string): string {
  const trimmed = value.trim().replace(/^[ '\"]+|[ '\"]+$/g, '');
  const escapedPem = trimmed.replace(/\\n/g, '\n').trim();
  if (escapedPem.includes('-----BEGIN ') && escapedPem.includes('-----END ')) return escapedPem;
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim().replace(/\\n/g, '\n').trim();
    if (decoded.includes('-----BEGIN ') && decoded.includes('-----END ')) return decoded;
  } catch {}
  return escapedPem;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export type PacketSignatureEnvelope = {
  algorithm: 'ed25519' | 'hmac-sha256';
  signature: string;
  keyId?: string;
};

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

export function signPayloadEd25519(payload: unknown, privateKeyPem: string, keyId?: string): string {
  const privateKey = createPrivateKey(normalizeSigningKey(privateKeyPem));
  const bytes = sign(null, Buffer.from(canonicalizeForSignature(payload)), privateKey).toString('base64url');
  return JSON.stringify({ algorithm: 'ed25519', keyId, signature: bytes } satisfies PacketSignatureEnvelope);
}

export function verifyPayloadEd25519(payload: unknown, signatureEnvelope: string, publicKeyPem: string, expectedKeyId?: string): boolean {
  let envelope: PacketSignatureEnvelope;
  try {
    envelope = JSON.parse(signatureEnvelope) as PacketSignatureEnvelope;
  } catch {
    return false;
  }
  if (envelope.algorithm !== 'ed25519' || !envelope.signature) return false;
  if (expectedKeyId && envelope.keyId && envelope.keyId !== expectedKeyId) return false;

  try {
    const publicKey = createPublicKey(normalizeSigningKey(publicKeyPem));
    return verify(null, Buffer.from(canonicalizeForSignature(payload)), publicKey, Buffer.from(envelope.signature, 'base64url'));
  } catch {
    return false;
  }
}

export function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashJson(input: unknown): string {
  return createHash('sha256').update(canonicalizeForSignature(input)).digest('hex');
}

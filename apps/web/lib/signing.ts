import { signPayloadEd25519, signPayloadHmac, verifyPayloadEd25519, verifyPayloadHmac } from '@opencause/shared';
import { isDevMode } from './runtime-config';
import { assertPacketSigningReady } from './signing-diagnostics';

function hmacSecret(): string {
  if (process.env.SIGNING_SECRET) return process.env.SIGNING_SECRET;
  if (isDevMode()) return 'opencause-dev-signing-secret-v1';
  throw new Error('missing_signing_secret');
}

function signingPrivateKey(): string | undefined {
  return process.env.PACKET_SIGNING_PRIVATE_KEY;
}

function signingPublicKey(): string | undefined {
  return process.env.PACKET_SIGNING_PUBLIC_KEY;
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, omitUndefined(v)]));
  }
  return value;
}

export function signWorkPacketPayload(payload: unknown): string {
  const normalizedPayload = omitUndefined(payload);
  const privateKey = signingPrivateKey();
  if (privateKey) {
    assertPacketSigningReady();
    return signPayloadEd25519(normalizedPayload, privateKey, process.env.PACKET_SIGNING_KEY_ID);
  }
  return signPayloadHmac(normalizedPayload, hmacSecret());
}

export function assertSignedWorkPacketPayload(payload: unknown, signature: string): void {
  if (!verifyWorkPacketSignature(payload, signature)) throw new Error('invalid_packet_signature_generated');
}

export function verifyWorkPacketSignature(payload: unknown, signature: string): boolean {
  const publicKey = signingPublicKey();
  if (publicKey) {
    return verifyPayloadEd25519(payload, signature, publicKey, process.env.PACKET_SIGNING_KEY_ID);
  }
  return verifyPayloadHmac(payload, signature, hmacSecret());
}

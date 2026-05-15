import { createHash, createPublicKey } from 'node:crypto';
import { signPayloadEd25519, signPayloadHmac, verifyPayloadEd25519, verifyPayloadHmac } from '@opencause/shared';
import { isDevMode } from './runtime-config';
import { normalizeSigningKey } from './signing-key-format';
import { assertPacketSigningReady } from './signing-diagnostics';

function hmacSecret(): string {
  if (process.env.SIGNING_SECRET) return process.env.SIGNING_SECRET;
  if (isDevMode()) return 'opencause-dev-signing-secret-v1';
  throw new Error('missing_signing_secret');
}

function signingPrivateKey(): string | undefined {
  return process.env.PACKET_SIGNING_PRIVATE_KEY ? normalizeSigningKey(process.env.PACKET_SIGNING_PRIVATE_KEY) : undefined;
}

function signingPublicKey(): string | undefined {
  return process.env.PACKET_SIGNING_PUBLIC_KEY ? normalizeSigningKey(process.env.PACKET_SIGNING_PUBLIC_KEY) : undefined;
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

export function getPacketSigningKeypair(): { keyId: string; publicKeyPem: string; privateKeyPem: string } {
  const keyId = process.env.PACKET_SIGNING_KEY_ID;
  const publicKeyPem = process.env.PACKET_SIGNING_PUBLIC_KEY;
  const privateKeyPem = process.env.PACKET_SIGNING_PRIVATE_KEY;
  if (!keyId || !publicKeyPem || !privateKeyPem) throw new Error('packet_signing_keypair_not_configured');
  return {
    keyId,
    publicKeyPem: normalizeSigningKey(publicKeyPem),
    privateKeyPem: normalizeSigningKey(privateKeyPem)
  };
}

export function publicKeyFingerprint(publicKeyPem: string): string {
  const key = createPublicKey(normalizeSigningKey(publicKeyPem));
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
}

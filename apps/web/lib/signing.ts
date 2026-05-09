import { signPayloadHmac, verifyPayloadHmac } from '@opencause/shared';
import { isDevMode } from './runtime-config';

function getSigningSecret(): string {
  if (process.env.SIGNING_SECRET) return process.env.SIGNING_SECRET;
  if (isDevMode()) return 'opencause-dev-signing-secret-v1';
  throw new Error('missing_signing_secret');
}

export function signWorkPacketPayload(payload: unknown): string {
  return signPayloadHmac(payload, getSigningSecret());
}

export function verifyWorkPacketSignature(payload: unknown, signature: string): boolean {
  return verifyPayloadHmac(payload, signature, getSigningSecret());
}

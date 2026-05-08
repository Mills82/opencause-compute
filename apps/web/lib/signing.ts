import { signPayloadHmac, verifyPayloadHmac } from '@opencause/shared';

function getSigningSecret(): string {
  return process.env.SIGNING_SECRET ?? 'opencause-dev-signing-secret-v1';
}

export function signWorkPacketPayload(payload: unknown): string {
  return signPayloadHmac(payload, getSigningSecret());
}

export function verifyWorkPacketSignature(payload: unknown, signature: string): boolean {
  return verifyPayloadHmac(payload, signature, getSigningSecret());
}

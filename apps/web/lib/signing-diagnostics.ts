import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { normalizeSigningKey, signingKeyFormat, type SigningKeyFormat } from './signing-key-format';

export type SigningDiagnostics = {
  signingMode: 'ed25519' | 'hmac-fallback';
  privateKeyPresent: boolean;
  publicKeyPresent: boolean;
  privateKeyParseOk: boolean;
  publicKeyParseOk: boolean;
  keyPairVerifyOk: boolean;
  keyId?: string;
  publicKeyFingerprint?: string;
  derivedPublicKeyFingerprint?: string;
  privateKeyFormat?: SigningKeyFormat;
  publicKeyFormat?: SigningKeyFormat;
  error?: string;
};

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function packetSigningDiagnostics(): SigningDiagnostics {
  const rawPrivate = process.env.PACKET_SIGNING_PRIVATE_KEY;
  const rawPublic = process.env.PACKET_SIGNING_PUBLIC_KEY;
  const base: SigningDiagnostics = {
    signingMode: rawPrivate && rawPublic ? 'ed25519' : 'hmac-fallback',
    privateKeyPresent: Boolean(rawPrivate),
    publicKeyPresent: Boolean(rawPublic),
    privateKeyParseOk: false,
    publicKeyParseOk: false,
    keyPairVerifyOk: false,
    keyId: process.env.PACKET_SIGNING_KEY_ID
  };
  if (!rawPrivate || !rawPublic) return base;

  try {
    base.privateKeyFormat = signingKeyFormat(rawPrivate);
    base.publicKeyFormat = signingKeyFormat(rawPublic);
    const privateKey = createPrivateKey(normalizeSigningKey(rawPrivate));
    base.privateKeyParseOk = true;
    const publicKey = createPublicKey(normalizeSigningKey(rawPublic));
    base.publicKeyParseOk = true;
    base.publicKeyFingerprint = fingerprint(publicKey.export({ type: 'spki', format: 'pem' }).toString());
    base.derivedPublicKeyFingerprint = fingerprint(createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString());
    const payload = Buffer.from('opencause-signing-healthcheck');
    const signature = sign(null, payload, privateKey);
    base.keyPairVerifyOk = verify(null, payload, publicKey, signature);
    return base;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : 'signing_diagnostics_failed' };
  }
}

export function assertPacketSigningReady(): void {
  const diagnostics = packetSigningDiagnostics();
  if (diagnostics.signingMode !== 'ed25519') return;
  if (!diagnostics.privateKeyParseOk || !diagnostics.publicKeyParseOk || !diagnostics.keyPairVerifyOk) {
    throw new Error(`packet_signing_key_invalid:${diagnostics.error ?? 'parse_or_verify_failed'}`);
  }
}

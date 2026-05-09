import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export type SigningDiagnostics = {
  signingMode: 'ed25519' | 'hmac-fallback';
  privateKeyPresent: boolean;
  publicKeyPresent: boolean;
  privateKeyParseOk: boolean;
  publicKeyParseOk: boolean;
  keyPairVerifyOk: boolean;
  error?: string;
};

function normalizePem(value: string): string {
  return value.trim().replace(/^['\"]|['\"]$/g, '').replace(/\\n/g, '\n');
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
    keyPairVerifyOk: false
  };
  if (!rawPrivate || !rawPublic) return base;

  try {
    const privateKey = createPrivateKey(normalizePem(rawPrivate));
    base.privateKeyParseOk = true;
    const publicKey = createPublicKey(normalizePem(rawPublic));
    base.publicKeyParseOk = true;
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

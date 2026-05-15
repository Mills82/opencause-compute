import { createPublicKey } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPacketSigningKeypair, publicKeyFingerprint } from './signing';

export type PacketSigningKeyRecord = {
  keyId: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  status: 'active' | 'verifying_only' | 'retired';
};

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim();
}

export function envSigningIdentity() {
  const keypair = getPacketSigningKeypair();
  const publicKeyPem = normalizePem(keypair.publicKeyPem);
  const derivedPublicKeyPem = createPublicKey(normalizePem(keypair.privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
  const publicFp = publicKeyFingerprint(publicKeyPem);
  const derivedFp = publicKeyFingerprint(derivedPublicKeyPem);
  return { keyId: keypair.keyId, publicKeyPem, publicKeyFingerprint: publicFp, derivedPublicKeyFingerprint: derivedFp, keypairMatches: publicFp === derivedFp };
}

export async function ensureActivePacketSigningKey(client: PoolClient): Promise<PacketSigningKeyRecord> {
  const env = envSigningIdentity();
  if (!env.keypairMatches) throw new Error('packet_signing_env_keypair_mismatch');
  const active = await client.query('SELECT key_id, public_key_pem, public_key_fingerprint, status FROM packet_signing_keys WHERE status = $1 ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1', ['active']);
  if (!active.rowCount) {
    await client.query('INSERT INTO packet_signing_keys(key_id, public_key_pem, public_key_fingerprint, status, activated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT (key_id) DO UPDATE SET public_key_pem = EXCLUDED.public_key_pem, public_key_fingerprint = EXCLUDED.public_key_fingerprint, status = EXCLUDED.status, activated_at = COALESCE(packet_signing_keys.activated_at, EXCLUDED.activated_at)', [env.keyId, env.publicKeyPem, env.publicKeyFingerprint, 'active']);
    return { keyId: env.keyId, publicKeyPem: env.publicKeyPem, publicKeyFingerprint: env.publicKeyFingerprint, status: 'active' };
  }
  const row = active.rows[0];
  if (row.key_id !== env.keyId || row.public_key_fingerprint !== env.publicKeyFingerprint) {
    throw new Error(`packet_signing_active_key_mismatch:env=${env.keyId}/${env.publicKeyFingerprint}:db=${row.key_id}/${row.public_key_fingerprint}`);
  }
  return { keyId: row.key_id, publicKeyPem: row.public_key_pem, publicKeyFingerprint: row.public_key_fingerprint, status: row.status };
}

export async function getPacketVerificationKey(client: PoolClient, keyId?: string | null, fingerprint?: string | null): Promise<PacketSigningKeyRecord | undefined> {
  if (keyId) {
    const byId = await client.query('SELECT key_id, public_key_pem, public_key_fingerprint, status FROM packet_signing_keys WHERE key_id = $1 AND status IN ($2,$3)', [keyId, 'active', 'verifying_only']);
    if (byId.rowCount) {
      const row = byId.rows[0];
      if (fingerprint && row.public_key_fingerprint !== fingerprint) return undefined;
      return { keyId: row.key_id, publicKeyPem: row.public_key_pem, publicKeyFingerprint: row.public_key_fingerprint, status: row.status };
    }
  }
  const env = envSigningIdentity();
  if ((!keyId || keyId === env.keyId) && (!fingerprint || fingerprint === env.publicKeyFingerprint)) {
    return { keyId: env.keyId, publicKeyPem: env.publicKeyPem, publicKeyFingerprint: env.publicKeyFingerprint, status: 'active' };
  }
  return undefined;
}

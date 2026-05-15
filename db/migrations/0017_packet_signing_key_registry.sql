CREATE TABLE IF NOT EXISTS packet_signing_keys (
  key_id TEXT PRIMARY KEY,
  public_key_pem TEXT NOT NULL,
  public_key_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'verifying_only', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ
);

ALTER TABLE work_packets ADD COLUMN IF NOT EXISTS signature_key_id TEXT;
ALTER TABLE work_packets ADD COLUMN IF NOT EXISTS signature_public_key_fingerprint TEXT;
ALTER TABLE work_packets ADD COLUMN IF NOT EXISTS signature_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS work_packets_signature_key_idx ON work_packets(signature_key_id, signature_public_key_fingerprint);

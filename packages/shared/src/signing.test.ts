import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashJson,
  hashText,
  signPayloadEd25519,
  signPayloadHmac,
  verifyPayloadEd25519,
  verifyPayloadHmac
} from './signing.js';

describe('signing', () => {
  it('signs and verifies hmac payloads', () => {
    const payload = { b: 1, a: 2 };
    const secret = 'test-secret';
    const signature = signPayloadHmac(payload, secret);

    expect(verifyPayloadHmac(payload, signature, secret)).toBe(true);
    expect(verifyPayloadHmac(payload, signature, 'wrong')).toBe(false);
  });

  it('signs and verifies ed25519 payloads without sharing the private key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const payload = { packetId: 'packet-1', title: 'Candidate extraction' };

    const signature = signPayloadEd25519(payload, privatePem, 'key-1');

    expect(verifyPayloadEd25519(payload, signature, publicPem, 'key-1')).toBe(true);
    expect(verifyPayloadEd25519({ ...payload, title: 'tampered' }, signature, publicPem, 'key-1')).toBe(false);
  });

  it('rejects ed25519 signatures from the wrong public key', () => {
    const first = generateKeyPairSync('ed25519');
    const second = generateKeyPairSync('ed25519');
    const signature = signPayloadEd25519(
      { packetId: 'packet-1' },
      first.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      'key-1'
    );

    expect(
      verifyPayloadEd25519(
        { packetId: 'packet-1' },
        signature,
        second.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'key-1'
      )
    ).toBe(false);
  });

  it('hashes text and json deterministically', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashJson({ x: 1, y: 2 })).toBe(hashJson({ y: 2, x: 1 }));
  });
});

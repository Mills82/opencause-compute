import { describe, expect, it } from 'vitest';
import { hashJson, hashText, signPayloadHmac, verifyPayloadHmac } from './signing.js';

describe('signing', () => {
  it('signs and verifies payload', () => {
    const payload = { b: 1, a: 2 };
    const secret = 'test-secret';
    const signature = signPayloadHmac(payload, secret);

    expect(verifyPayloadHmac(payload, signature, secret)).toBe(true);
    expect(verifyPayloadHmac(payload, signature, 'wrong')).toBe(false);
  });

  it('hashes text and json deterministically', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashJson({ x: 1, y: 2 })).toBe(hashJson({ y: 2, x: 1 }));
  });
});

export type SigningKeyFormat = 'pem' | 'base64-pem';

export function normalizeSigningKey(value: string): string {
  const trimmed = value.trim().replace(/^[ '\"]+|[ '\"]+$/g, '');
  const escapedPem = trimmed.replace(/\\n/g, '\n').trim();
  if (escapedPem.includes('-----BEGIN ') && escapedPem.includes('-----END ')) return escapedPem;

  const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim().replace(/\\n/g, '\n').trim();
  if (decoded.includes('-----BEGIN ') && decoded.includes('-----END ')) return decoded;

  return escapedPem;
}

export function signingKeyFormat(value: string): SigningKeyFormat {
  const trimmed = value.trim().replace(/^[ '\"]+|[ '\"]+$/g, '');
  const escapedPem = trimmed.replace(/\\n/g, '\n').trim();
  if (escapedPem.includes('-----BEGIN ') && escapedPem.includes('-----END ')) return 'pem';
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim().replace(/\\n/g, '\n').trim();
  if (decoded.includes('-----BEGIN ') && decoded.includes('-----END ')) return 'base64-pem';
  return 'pem';
}

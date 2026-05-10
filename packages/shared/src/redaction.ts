const TOKEN_QUERY_RE = /([?&](?:token|profileSetupToken|profile_setup_token|nodeToken|node_token|enrollmentCode|enrollment_code)=)[^\s&"'<>]+/gi;
const JSON_SECRET_RE = /("(?:nodeToken|profileSetupToken|enrollmentCode|authorization|x-node-token)"\s*:\s*")[^"]*(")/gi;
const HEADER_SECRET_RE = /\b(authorization\s*[:=]\s*bearer\s+|x-node-token\s*[:=]\s*)[^\s,"'<>]+/gi;
const ARG_SECRET_RE = /(--(?:node-token|enrollment-code)\s+)[^\s]+/gi;
const OCC_CODE_RE = /\bocc_[A-Za-z0-9_-]{8,}\b/g;

export function redactSensitive(value: unknown): string {
  return String(value)
    .replace(TOKEN_QUERY_RE, '$1[redacted]')
    .replace(JSON_SECRET_RE, '$1[redacted]$2')
    .replace(HEADER_SECRET_RE, '$1[redacted]')
    .replace(ARG_SECRET_RE, '$1[redacted]')
    .replace(OCC_CODE_RE, '[redacted-enrollment-code]');
}

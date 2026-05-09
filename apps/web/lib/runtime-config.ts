export function isDevMode(): boolean {
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test' || process.env.OPENCAUSE_LOCAL_DEV === 'true';
}

export function isHostedMode(): boolean {
  return process.env.OPENCAUSE_HOSTED === 'true' || process.env.VERCEL === '1';
}

export function productionEnvStatus(): { ok: boolean; missing: string[] } {
  if (!isHostedMode()) return { ok: true, missing: [] };
  const missing = ['DATABASE_URL', 'ADMIN_API_KEY', 'NCBI_EMAIL'].filter((key) => !process.env[key]);
  if (!process.env.PACKET_SIGNING_PRIVATE_KEY) missing.push('PACKET_SIGNING_PRIVATE_KEY');
  if (!process.env.PACKET_SIGNING_PUBLIC_KEY) missing.push('PACKET_SIGNING_PUBLIC_KEY');
  if (process.env.ENABLE_CRON_INGEST === 'true' && !process.env.CRON_SECRET) missing.push('CRON_SECRET');
  return { ok: missing.length === 0, missing };
}

export function requireProductionEnv(): void {
  const status = productionEnvStatus();
  if (!status.ok) throw new Error(`missing_required_env:${status.missing.join(',')}`);
}

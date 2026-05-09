export function isDevMode(): boolean {
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test' || process.env.OPENCAUSE_LOCAL_DEV === 'true';
}

export function isHostedMode(): boolean {
  return !isDevMode() || process.env.OPENCAUSE_HOSTED === 'true' || process.env.VERCEL === '1';
}

export function requireProductionEnv(): void {
  if (!isHostedMode()) return;
  const missing = ['DATABASE_URL', 'SIGNING_SECRET', 'ADMIN_API_KEY'].filter((key) => !process.env[key]);
  if (process.env.ENABLE_CRON_INGEST === 'true' && !process.env.CRON_SECRET) missing.push('CRON_SECRET');
  if (missing.length) throw new Error(`missing_required_env:${missing.join(',')}`);
}

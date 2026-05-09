import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL });
  return pool;
}

export async function checkPostgresRateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number } | null> {
  const pool = getPool();
  if (!pool || process.env.OPENCAUSE_DB_RATE_LIMITS === 'false') return null;

  const resetAt = new Date(Date.now() + options.windowMs);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM rate_limit_buckets WHERE reset_at <= NOW()');
    const row = await client.query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limit_buckets(bucket_key, count, reset_at, updated_at)
       VALUES($1, 1, $2, NOW())
       ON CONFLICT(bucket_key) DO UPDATE SET
         count = CASE WHEN rate_limit_buckets.reset_at <= NOW() THEN 1 ELSE rate_limit_buckets.count + 1 END,
         reset_at = CASE WHEN rate_limit_buckets.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE rate_limit_buckets.reset_at END,
         updated_at = NOW()
       RETURNING count, reset_at`,
      [key, resetAt]
    );
    await client.query('COMMIT');
    const current = row.rows[0];
    if (!current) return { allowed: true };
    if (Number(current.count) > options.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((new Date(current.reset_at).getTime() - Date.now()) / 1000)) };
    }
    return { allowed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    // Fail open for availability; callers still have auth and app-level checks.
    return null;
  } finally {
    client.release();
  }
}

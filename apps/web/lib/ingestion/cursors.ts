import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
let pool: Pool | null = null;

function enabled(): boolean {
  return Boolean(DATABASE_URL) && process.env.OPENCAUSE_RELATIONAL_STORAGE !== 'false' && (process.env.VERCEL === '1' || process.env.OPENCAUSE_HOSTED === 'true' || process.env.OPENCAUSE_RELATIONAL_STORAGE === 'true');
}

function getPool(): Pool {
  if (!DATABASE_URL) throw new Error('database_url_missing');
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL });
  return pool;
}

export type IngestionCursor = {
  sourceType: string;
  query: string;
  nextRetstart: number;
};

async function ensureCursorTable(): Promise<void> {
  await getPool().query(`CREATE TABLE IF NOT EXISTS ingestion_cursors (id UUID PRIMARY KEY, source_type TEXT NOT NULL, query TEXT NOT NULL, next_retstart INTEGER NOT NULL DEFAULT 0, last_retmax INTEGER NOT NULL DEFAULT 0, last_records_fetched INTEGER NOT NULL DEFAULT 0, last_run_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await getPool().query(`CREATE UNIQUE INDEX IF NOT EXISTS ingestion_cursors_source_query_idx ON ingestion_cursors(source_type, query)`);
}

export async function getIngestionCursor(sourceType: string, query: string): Promise<IngestionCursor | undefined> {
  if (!enabled()) return undefined;
  await ensureCursorTable();
  const row = (await getPool().query(`INSERT INTO ingestion_cursors(id,source_type,query,next_retstart) VALUES($1,$2,$3,0) ON CONFLICT (source_type,query) DO UPDATE SET query=EXCLUDED.query RETURNING source_type,query,next_retstart`, [randomUUID(), sourceType, query])).rows[0];
  return { sourceType: row.source_type, query: row.query, nextRetstart: Number(row.next_retstart) };
}

export async function advanceIngestionCursor(input: { sourceType: string; query: string; retmax: number; recordsFetched: number; runId?: string }): Promise<void> {
  if (!enabled() || input.retmax <= 0) return;
  await ensureCursorTable();
  await getPool().query(`UPDATE ingestion_cursors SET next_retstart = CASE WHEN $4::int < $3::int THEN 0 ELSE next_retstart + $3::int END, last_retmax=$3::int, last_records_fetched=$4::int, last_run_id=$5, updated_at=NOW() WHERE source_type=$1 AND query=$2`, [input.sourceType, input.query, input.retmax, input.recordsFetched, input.runId ?? null]);
}

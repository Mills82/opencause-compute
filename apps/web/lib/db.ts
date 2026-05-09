import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema, type DatabaseState } from '@opencause/shared';
import { Pool, type PoolClient } from 'pg';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL;
const STATE_ROW_ID = 1;

const EMPTY_DB: DatabaseState = {
  projects: [],
  workPackets: [],
  nodes: [],
  claims: [],
  results: [],
  facts: [],
  ingestionRuns: [],
  workerControl: {
    paused: false,
    idleMode: 'user-and-cpu',
    minIdleSeconds: 120,
    maxCpuPercent: 35,
    runNowToken: 0,
    updatedAt: new Date().toISOString()
  }
};

let pool: Pool | null = null;
let pgInitialized = false;

function shouldUsePostgres(): boolean {
  return Boolean(DATABASE_URL);
}

function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('database_url_missing');
  }
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

async function ensurePostgresSchema(client: PoolClient): Promise<void> {
  if (pgInitialized) {
    return;
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS opencause_state (
      id INTEGER PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgInitialized = true;
}

async function loadDbFromPostgres(): Promise<DatabaseState> {
  const client = await getPool().connect();
  try {
    await ensurePostgresSchema(client);
    const existing = await client.query<{ state: DatabaseState }>(
      'SELECT state FROM opencause_state WHERE id = $1',
      [STATE_ROW_ID]
    );
    if (existing.rowCount && existing.rows[0]) {
      return databaseSchema.parse(existing.rows[0].state);
    }

    const initial = databaseSchema.parse(EMPTY_DB);
    await client.query(
      `INSERT INTO opencause_state (id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [STATE_ROW_ID, JSON.stringify(initial)]
    );
    return initial;
  } finally {
    client.release();
  }
}

async function saveDbToPostgres(db: DatabaseState): Promise<void> {
  const client = await getPool().connect();
  try {
    await ensurePostgresSchema(client);
    const parsed = databaseSchema.parse(db);
    await client.query(
      `INSERT INTO opencause_state (id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [STATE_ROW_ID, JSON.stringify(parsed)]
    );
  } finally {
    client.release();
  }
}

export async function loadDb(): Promise<DatabaseState> {
  if (shouldUsePostgres()) {
    return loadDbFromPostgres();
  }

  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    if (!parsed.workerControl) {
      parsed.workerControl = { ...EMPTY_DB.workerControl };
    }
    if (!parsed.ingestionRuns) {
      parsed.ingestionRuns = [];
    }
    return databaseSchema.parse(parsed);
  } catch {
    await saveDb(EMPTY_DB);
    return EMPTY_DB;
  }
}

export async function saveDb(db: DatabaseState): Promise<void> {
  if (shouldUsePostgres()) {
    await saveDbToPostgres(db);
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  const parsed = databaseSchema.parse(db);
  await writeFile(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
}

export async function withDb<T>(fn: (db: DatabaseState) => T | Promise<T>): Promise<T> {
  if (shouldUsePostgres()) {
    const client = await getPool().connect();
    try {
      await ensurePostgresSchema(client);
      await client.query('BEGIN');

      let row = await client.query<{ state: DatabaseState }>(
        'SELECT state FROM opencause_state WHERE id = $1 FOR UPDATE',
        [STATE_ROW_ID]
      );

      if (!row.rowCount || !row.rows[0]) {
        const initial = databaseSchema.parse(EMPTY_DB);
        await client.query(
          `INSERT INTO opencause_state (id, state, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [STATE_ROW_ID, JSON.stringify(initial)]
        );
        row = await client.query<{ state: DatabaseState }>(
          'SELECT state FROM opencause_state WHERE id = $1 FOR UPDATE',
          [STATE_ROW_ID]
        );
      }

      const state = databaseSchema.parse(row.rows[0]?.state ?? EMPTY_DB);
      const result = await fn(state);
      const parsed = databaseSchema.parse(state);
      await client.query('UPDATE opencause_state SET state = $1::jsonb, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(parsed),
        STATE_ROW_ID
      ]);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const db = await loadDb();
  const result = await fn(db);
  await saveDb(db);
  return result;
}

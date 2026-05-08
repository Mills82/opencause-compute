import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema, type DatabaseState } from '@opencause/shared';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const EMPTY_DB: DatabaseState = {
  projects: [],
  workPackets: [],
  nodes: [],
  claims: [],
  results: [],
  facts: []
};

export async function loadDb(): Promise<DatabaseState> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    return databaseSchema.parse(JSON.parse(raw));
  } catch {
    await saveDb(EMPTY_DB);
    return EMPTY_DB;
  }
}

export async function saveDb(db: DatabaseState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const parsed = databaseSchema.parse(db);
  await writeFile(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
}

export async function withDb<T>(fn: (db: DatabaseState) => T | Promise<T>): Promise<T> {
  const db = await loadDb();
  const result = await fn(db);
  await saveDb(db);
  return result;
}

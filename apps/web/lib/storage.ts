import type { DatabaseState } from '@opencause/shared';
import { loadDb, saveDb, withDb } from './db';

export type AppStorage = {
  load(): Promise<DatabaseState>;
  save(db: DatabaseState): Promise<void>;
  transaction<T>(fn: (db: DatabaseState) => T | Promise<T>): Promise<T>;
};

export class JsonStateStorage implements AppStorage {
  load(): Promise<DatabaseState> {
    return loadDb();
  }

  save(db: DatabaseState): Promise<void> {
    return saveDb(db);
  }

  transaction<T>(fn: (db: DatabaseState) => T | Promise<T>): Promise<T> {
    return withDb(fn);
  }
}

export function getStorage(): AppStorage {
  // Future relational implementation should satisfy this interface without callers
  // loading or mutating the entire JSONB state document.
  return new JsonStateStorage();
}

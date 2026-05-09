import { describe, expect, it } from 'vitest';
import type { DatabaseState } from '@opencause/shared';
import type { AppStorage } from '../lib/storage';
import { seedDemoData } from '../lib/coordinator';

function emptyDb(): DatabaseState {
  return {
    projects: [],
    workPackets: [],
    nodes: [],
    claims: [],
    results: [],
    facts: [],
    ingestionRuns: [],
    auditEvents: [],
    volunteerEnrollments: [],
    workerControl: {
      paused: false,
      idleMode: 'user-and-cpu',
      minIdleSeconds: 120,
      maxCpuPercent: 35,
      runNowToken: 0,
      updatedAt: new Date().toISOString()
    }
  };
}

class MemoryStorage implements AppStorage {
  constructor(private db: DatabaseState = emptyDb()) {}

  async load(): Promise<DatabaseState> {
    return this.db;
  }

  async save(db: DatabaseState): Promise<void> {
    this.db = db;
  }

  async transaction<T>(fn: (db: DatabaseState) => T | Promise<T>): Promise<T> {
    return await fn(this.db);
  }
}

describe('storage contract', () => {
  it('supports transaction-style mutations behind an abstraction', async () => {
    const storage: AppStorage = new MemoryStorage();

    const result = await storage.transaction((db) => seedDemoData(db));
    const db = await storage.load();

    expect(result.packetsCreated).toBeGreaterThan(0);
    expect(db.projects).toHaveLength(1);
    expect(db.workPackets.length).toBeGreaterThan(0);
  });
});

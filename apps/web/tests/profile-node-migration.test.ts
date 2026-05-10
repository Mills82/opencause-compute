import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('profile-node uniqueness migration', () => {
  it('adds a partial unique index for one active profile per node', () => {
    const sql = readFileSync(resolve(process.cwd(), '../../db/migrations/0009_hardening_consensus_profile_nodes.sql'), 'utf8');
    expect(sql).toContain('volunteer_profile_nodes_one_active_node_idx');
    expect(sql).toContain('WHERE detached_at IS NULL');
  });
});

import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { hashEnrollmentCode } from '../lib/coordinator';

const url = process.env.TEST_DATABASE_URL ?? process.env.POSTGRES_TEST_URL;
const describePg = url ? describe : describe.skip;

async function applyMigrations(pool: Pool) {
  const migrationDir = resolve(process.cwd(), '../../db/migrations');
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(resolve(migrationDir, file), 'utf8'));
  }
}

async function freshDb() {
  const pool = new Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applyMigrations(pool);
  process.env.DATABASE_URL = url;
  process.env.OPENCAUSE_RELATIONAL_STORAGE = 'true';
  return pool;
}

describePg('real Postgres relational storage integration', () => {
  it('applies migrations from an empty database and exercises targeted repositories', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      process.env.OPENCAUSE_HOSTED = 'true';
      delete process.env.NODE_ENROLLMENT_CODE;
      delete process.env.NODE_ENROLLMENT_CODES;

      const code = `occ_${randomBytes(18).toString('base64url')}`;
      const enrollment = await repo.issueVolunteerEnrollmentRelational('a@example.com', hashEnrollmentCode(code));
      expect(enrollment?.status).toBe('issued');

      const registration = await repo.registerNodeRelational({ nodeName: 'fresh-win', platform: 'win32', version: '0.1.0', capabilities: ['local-llm-v1'], enrollmentCode: code });
      expect(registration?.node.id).toBeTruthy();
      expect(registration?.nodeToken).toBeTruthy();
      expect(registration?.profileSetupToken).toMatch(/^ocp_/);

      const consumed = (await pool.query('SELECT status, used_at, node_id FROM volunteer_enrollments WHERE id = $1', [enrollment?.id])).rows[0];
      expect(consumed.status).toBe('used');
      expect(consumed.used_at).toBeTruthy();
      expect(consumed.node_id).toBe(registration?.node.id);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profiles')).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profile_nodes WHERE node_id = $1 AND detached_at IS NULL', [registration?.node.id])).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profiles WHERE setup_token_hash IS NOT NULL')).rows[0].count)).toBe(1);
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM audit_events WHERE action = 'node.registered'")).rows[0].count)).toBe(1);

      const heartbeat = await repo.heartbeatNodeRelational(registration!.node.id, registration!.nodeToken);
      expect(heartbeat?.status).toBe('online');

      const control = await repo.updateWorkerControlRelational({ paused: true, maxCpuPercent: 25 });
      expect(control?.paused).toBe(true);
      const runNow = await repo.triggerRunNowRelational();
      expect(runNow?.runNowToken).toBe((control?.runNowToken ?? 0) + 1);

      const report = await repo.createPublicReportRelational({ targetType: 'team', targetSlug: 'bad-team', reason: 'spam' });
      expect(report?.status).toBe('open');
      await repo.appendAuditEventRelational({ actorType: 'system', action: 'test.audit.append', targetType: 'system' });
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM audit_events')).rows[0].count)).toBeGreaterThanOrEqual(4);
    } finally {
      await pool.end();
      delete process.env.OPENCAUSE_HOSTED;
    }
  });

  it('rejects used/revoked codes, hosted no-code registration, and still accepts configured env codes', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      process.env.OPENCAUSE_HOSTED = 'true';
      delete process.env.NODE_ENROLLMENT_CODE;
      delete process.env.NODE_ENROLLMENT_CODES;

      const usedCode = `occ_${randomBytes(18).toString('base64url')}`;
      const used = await repo.issueVolunteerEnrollmentRelational('used@example.com', hashEnrollmentCode(usedCode));
      await repo.registerNodeRelational({ nodeName: 'n1', platform: 'win32', version: '0.1.0', capabilities: [], enrollmentCode: usedCode });
      await expect(repo.registerNodeRelational({ nodeName: 'n2', platform: 'win32', version: '0.1.0', capabilities: [], enrollmentCode: usedCode })).rejects.toThrow('enrollment_code_used_or_revoked');

      const revokedCode = `occ_${randomBytes(18).toString('base64url')}`;
      const revoked = await repo.issueVolunteerEnrollmentRelational('revoked@example.com', hashEnrollmentCode(revokedCode));
      await repo.updateVolunteerEnrollmentStatusRelational(revoked!.id, 'revoked');
      await expect(repo.registerNodeRelational({ nodeName: 'n3', platform: 'win32', version: '0.1.0', capabilities: [], enrollmentCode: revokedCode })).rejects.toThrow('enrollment_code_used_or_revoked');

      await expect(repo.registerNodeRelational({ nodeName: 'n4', platform: 'win32', version: '0.1.0', capabilities: [] })).rejects.toThrow('enrollment_not_configured');

      process.env.NODE_ENROLLMENT_CODE = 'env-code';
      const envRegistration = await repo.registerNodeRelational({ nodeName: 'env', platform: 'win32', version: '0.1.0', capabilities: [], enrollmentCode: 'env-code' });
      expect(envRegistration?.node.enrollmentCodeHash).toBe(hashEnrollmentCode('env-code'));
    } finally {
      await pool.end();
      delete process.env.OPENCAUSE_HOSTED;
      delete process.env.NODE_ENROLLMENT_CODE;
    }
  });
});

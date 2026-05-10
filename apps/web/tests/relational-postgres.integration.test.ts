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
      const registration = await repo.registerNodeRelational({ nodeName: 'fresh-win', platform: 'win32', version: '0.1.0', capabilities: ['local-llm-v1'], enrollmentCode: code });
      expect(enrollment?.status).toBe('issued');
      expect(registration?.node.id).toBeTruthy();
      expect(registration?.profileSetupToken).toMatch(/^ocp_/);
      const consumed = (await pool.query('SELECT status, used_at, node_id FROM volunteer_enrollments WHERE id = $1', [enrollment?.id])).rows[0];
      expect(consumed.status).toBe('used');
      expect(consumed.node_id).toBe(registration?.node.id);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profile_nodes WHERE node_id = $1 AND detached_at IS NULL', [registration?.node.id])).rows[0].count)).toBe(1);
      await repo.heartbeatNodeRelational(registration!.node.id, registration!.nodeToken);
      const control = await repo.updateWorkerControlRelational({ paused: true, maxCpuPercent: 25 });
      expect(control?.paused).toBe(true);
      const runNow = await repo.triggerRunNowRelational();
      expect(runNow?.runNowToken).toBe((control?.runNowToken ?? 0) + 1);
      const report = await repo.createPublicReportRelational({ targetType: 'team', targetSlug: 'bad-team', reason: 'spam' });
      expect(report?.status).toBe('open');
      const run = await repo.startIngestionRunRelational({ sourceType: 'pubmed_abstract', mode: 'manual', query: 'q', retmax: 1, usedNcbiEmail: false, usedNcbiApiKey: false });
      const ingested = await repo.ingestSourcesRelational({ projectSlug: 'proj', projectName: 'Project', projectDescription: 'Desc', sources: [{ title: 'T', sourceText: 'text', sourceCitation: 'cite', sourceUrl: 'https://example.com/a' }], extractor: 'local-llm-v1' });
      await repo.completeIngestionRunRelational(run.id, { fetchedCount: 1, packetsCreated: ingested.packetsCreated, packetsSkipped: ingested.packetsSkipped });
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_packets WHERE status = 'queued'")).rows[0].count)).toBe(1);
      await repo.appendAuditEventRelational({ actorType: 'system', action: 'test.audit.append', targetType: 'system' });
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM audit_events')).rows[0].count)).toBeGreaterThanOrEqual(6);
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
      await repo.issueVolunteerEnrollmentRelational('used@example.com', hashEnrollmentCode(usedCode));
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

  it('supports cron-style ingestion semantics without clobbering existing claims/results', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      const firstRun = await repo.startIngestionRunRelational({ sourceType: 'combined', mode: 'cron', query: 'pubmed | pmc', retmax: 2, usedNcbiEmail: false, usedNcbiApiKey: false });
      const pubmed = await repo.ingestSourcesRelational({ projectSlug: 'cron-proj', projectName: 'Cron Project', projectDescription: 'Desc', sources: [{ title: 'A', sourceText: 'alpha', sourceCitation: 'cite a', sourceUrl: 'https://example.com/a' }], extractor: 'local-llm-v1' });
      const pmc = await repo.ingestSourcesRelational({ projectSlug: 'cron-proj', projectName: 'Cron Project', projectDescription: 'Desc', sources: [{ title: 'B', sourceText: 'beta', sourceCitation: 'cite b', sourceUrl: 'https://example.com/b' }], extractor: 'local-llm-v1' });
      await repo.completeIngestionRunRelational(firstRun.id, { fetchedCount: 2, skippedCount: 0, failedCount: 1, failureReasons: ['PMC1:fetch_failed'], packetsCreated: pubmed.packetsCreated + pmc.packetsCreated, packetsSkipped: 0 });
      const completed = (await pool.query('SELECT status, failed_count, packets_created FROM ingestion_runs WHERE id = $1', [firstRun.id])).rows[0];
      expect(completed.status).toBe('partial_failed');
      expect(Number(completed.failed_count)).toBe(1);
      expect(Number(completed.packets_created)).toBe(2);
      const node = await pool.query("INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash) VALUES(gen_random_uuid(),'n','linux','0.1.0','online',ARRAY[]::text[],NOW(),NOW(),'hash') RETURNING id");
      const claimedPacket = (await pool.query("UPDATE work_packets SET status='claimed' WHERE source_url='https://example.com/a' RETURNING id")).rows[0];
      await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes')", [claimedPacket.id, node.rows[0].id]);
      await pool.query("INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,payload,summary,validated,format_validated,consensus_status,review_status,validation_errors,warnings,submitted_at,provenance) VALUES(gen_random_uuid(),$1,$2,gen_random_uuid(),'v','h','{}','ok',true,true,'consensus_pending','not_reviewed','[]','[]',NOW(),'{}')", [claimedPacket.id, node.rows[0].id]);
      const secondRun = await repo.startIngestionRunRelational({ sourceType: 'combined', mode: 'cron', query: 'pubmed | pmc', retmax: 1, usedNcbiEmail: false, usedNcbiApiKey: false });
      await repo.ingestSourcesRelational({ projectSlug: 'cron-proj', projectName: 'Cron Project', projectDescription: 'Desc', sources: [{ title: 'C', sourceText: 'gamma', sourceCitation: 'cite c', sourceUrl: 'https://example.com/c' }], extractor: 'local-llm-v1' });
      await repo.completeIngestionRunRelational(secondRun.id, { fetchedCount: 1, packetsCreated: 1, packetsSkipped: 0 });
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_claims WHERE status='claimed'")).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM extraction_results')).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('cron queue target met path can skip without creating runs or mutating packets', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      await repo.ingestSourcesRelational({ projectSlug: 'full', projectName: 'Full', projectDescription: 'Desc', sources: [{ title: 'A', sourceText: 'alpha', sourceCitation: 'cite', sourceUrl: 'https://example.com/full' }], extractor: 'local-llm-v1' });
      const snapshot = await repo.queueSnapshotRelational();
      const queueDeficit = Math.max(0, 1 - snapshot.totalPackets);
      expect(queueDeficit).toBe(0);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM ingestion_runs')).rows[0].count)).toBe(0);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM work_packets')).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('cron failure completion marks started runs failed without clobbering claims', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      await repo.ingestSourcesRelational({ projectSlug: 'fail', projectName: 'Fail', projectDescription: 'Desc', sources: [{ title: 'A', sourceText: 'alpha', sourceCitation: 'cite', sourceUrl: 'https://example.com/fail' }], extractor: 'local-llm-v1' });
      const node = await pool.query("INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash) VALUES(gen_random_uuid(),'n','linux','0.1.0','online',ARRAY[]::text[],NOW(),NOW(),'hash') RETURNING id");
      const packet = (await pool.query("UPDATE work_packets SET status='claimed' WHERE source_url='https://example.com/fail' RETURNING id")).rows[0];
      await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes')", [packet.id, node.rows[0].id]);
      const run = await repo.startIngestionRunRelational({ sourceType: 'combined', mode: 'cron', query: 'q', retmax: 1, usedNcbiEmail: false, usedNcbiApiKey: false });
      await repo.completeIngestionRunRelational(run.id, { status: 'failed', failedCount: 1, failureReasons: ['network'] });
      expect((await pool.query('SELECT status FROM ingestion_runs WHERE id=$1', [run.id])).rows[0].status).toBe('failed');
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_claims WHERE status='claimed'")).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
    }
  });
});

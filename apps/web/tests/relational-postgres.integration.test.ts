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
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
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
      await repo.createTeamAdminRelational({ name: 'Report Team', description: 'Reportable', visibility: 'public' });
      const report = await repo.createPublicReportRelational({ targetType: 'team', targetSlug: 'report-team', reason: 'spam' });
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
      const node = await pool.query("INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash) VALUES(gen_random_uuid(),'n','linux','0.1.0','online','[]'::jsonb,NOW(),NOW(),'hash') RETURNING id");
      const claimedPacket = (await pool.query("UPDATE work_packets SET status='claimed' WHERE source_url='https://example.com/a' RETURNING id")).rows[0];
      const claim = (await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes') RETURNING id", [claimedPacket.id, node.rows[0].id])).rows[0];
      await pool.query("INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,summary,validated,format_validated,consensus_status,review_status,validation_errors,warnings,submitted_at,provenance) VALUES(gen_random_uuid(),$1,$2,$3,'Local LLM v1','h','ok',true,true,'consensus_pending','not_reviewed','[]','[]',NOW(),jsonb_build_object('workerVersion','0.1.0','extractorVersion','Local LLM v1','promptVersion','test','promptHash','hash','packetSchemaVersion','work-packet-v1','extractionTimestamp',NOW()::text,'workerPlatform','linux','workerCapabilities',jsonb_build_array(),'resultValidationVersion','format-validation-v1'))", [claimedPacket.id, node.rows[0].id, claim.id]);
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
      const node = await pool.query("INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash) VALUES(gen_random_uuid(),'n','linux','0.1.0','online','[]'::jsonb,NOW(),NOW(),'hash') RETURNING id");
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

  it('supports volunteer profile setup read/update/team changes without clobbering worker state', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      process.env.OPENCAUSE_HOSTED = 'true';
      const code = `occ_${randomBytes(18).toString('base64url')}`;
      await repo.issueVolunteerEnrollmentRelational('profile@example.com', hashEnrollmentCode(code));
      const registration = await repo.registerNodeRelational({ nodeName: 'profile-node', platform: 'win32', version: '0.1.0', capabilities: [], enrollmentCode: code });
      const token = registration.profileSetupToken;
      const setup = await repo.readProfileSetupRelational(token);
      expect(setup.profile.displayName).toMatch(/^Volunteer/);
      await expect(repo.readProfileSetupRelational('bad-token')).rejects.toThrow('invalid_or_expired_profile_setup_token');
      await pool.query("UPDATE volunteer_profiles SET setup_token_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [setup.profile.id]);
      await expect(repo.readProfileSetupRelational(token)).rejects.toThrow('invalid_or_expired_profile_setup_token');
      await pool.query("UPDATE volunteer_profiles SET setup_token_expires_at = NOW() + INTERVAL '1 day' WHERE id = $1", [setup.profile.id]);
      const team = (await pool.query("INSERT INTO teams(id,name,slug,description,visibility,created_at,updated_at) VALUES(gen_random_uuid(),'Public Team','public-team','Public','public',NOW(),NOW()) RETURNING id")).rows[0];
      const privateTeam = (await pool.query("INSERT INTO teams(id,name,slug,description,visibility,created_at,updated_at) VALUES(gen_random_uuid(),'Private Team','private-team','Private','private',NOW(),NOW()) RETURNING id")).rows[0];
      const updated = await repo.updateProfileSetupRelational({ token, displayName: '  New Name  ', privacyMode: 'public_named', publicProfileEnabled: true, bio: '  hi  ', avatarColor: ' #fff ', teamId: team.id });
      expect(updated.displayName).toBe('New Name');
      expect(updated.publicProfileEnabled).toBe(true);
      expect(updated.bio).toBe('hi');
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profile_nodes WHERE volunteer_profile_id=$1 AND detached_at IS NULL', [setup.profile.id])).rows[0].count)).toBe(1);
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM team_memberships WHERE volunteer_profile_id=$1 AND team_id=$2 AND status='active'", [setup.profile.id, team.id])).rows[0].count)).toBe(1);
      await expect(repo.updateProfileSetupRelational({ token, teamId: privateTeam.id })).rejects.toThrow('team_not_found');
      await repo.updateProfileSetupRelational({ token, teamId: null });
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM team_memberships WHERE volunteer_profile_id=$1 AND status='active'", [setup.profile.id])).rows[0].count)).toBe(0);
      await repo.ingestSourcesRelational({ projectSlug: 'p', projectName: 'P', projectDescription: 'D', sources: [{ title: 'A', sourceText: 'alpha', sourceCitation: 'cite', sourceUrl: 'https://example.com/profile-state' }], extractor: 'local-llm-v1' });
      const packet = (await pool.query("UPDATE work_packets SET status='claimed' WHERE source_url='https://example.com/profile-state' RETURNING id")).rows[0];
      const claim = (await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes') RETURNING id", [packet.id, registration.node.id])).rows[0];
      await pool.query("INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,summary,validated,format_validated,consensus_status,review_status,validation_errors,warnings,submitted_at,provenance) VALUES(gen_random_uuid(),$1,$2,$3,'Local LLM v1','h','ok',true,true,'consensus_pending','not_reviewed','[]','[]',NOW(),jsonb_build_object('workerVersion','0.1.0','extractorVersion','Local LLM v1','promptVersion','test','promptHash','hash','packetSchemaVersion','work-packet-v1','extractionTimestamp',NOW()::text,'workerPlatform','linux','workerCapabilities',jsonb_build_array(),'resultValidationVersion','format-validation-v1'))", [packet.id, registration.node.id, claim.id]);
      await repo.updateProfileSetupRelational({ token, bio: 'still safe' });
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_claims WHERE status='claimed'")).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM extraction_results')).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
      delete process.env.OPENCAUSE_HOSTED;
    }
  });


  it('keeps profile setup relational response camelCase-compatible and gamification admin mutations preserve worker state', async () => {
    const pool = await freshDb();
    try {
      const repo = await import('../lib/relational-app');
      process.env.OPENCAUSE_HOSTED = 'true';
      const code = `occ_${randomBytes(18).toString('base64url')}`;
      await repo.issueVolunteerEnrollmentRelational('admin-gamification@example.com', hashEnrollmentCode(code));
      const registration = await repo.registerNodeRelational({ nodeName: 'g-node', platform: 'linux', version: '0.1.0', capabilities: [], enrollmentCode: code });
      const setup = await repo.readProfileSetupRelational(registration.profileSetupToken);
      await pool.query("INSERT INTO volunteer_stats_snapshots(id,volunteer_profile_id,stats_window,contribution_score,sections_processed,packets_submitted,format_validated_submissions,format_rejected_submissions,consensus_passed_contributions,consensus_failed_contributions,human_reviewed_accepted_contributions,idle_minutes_donated,distinct_active_days,current_streak_days,longest_streak_days,badges_count,computed_at) VALUES(gen_random_uuid(),$1,'all_time',5,1,1,1,0,0,0,0,0,1,1,1,0,NOW())", [setup.profile.id]);
      await pool.query("INSERT INTO impact_digests(id,volunteer_profile_id,period_start,period_end,sections_processed,format_validated_submissions,consensus_passed_contributions,idle_minutes_donated,badges_awarded,team_rank,preview_text,created_at,delivered_at) VALUES(gen_random_uuid(),$1,NOW()-INTERVAL '7 days',NOW(),1,1,0,0,0,NULL,'preview',NOW(),NULL)", [setup.profile.id]);
      const shaped = await repo.readProfileSetupRelational(registration.profileSetupToken);
      expect(shaped.stats).toHaveProperty('volunteerProfileId', setup.profile.id);
      expect(shaped.stats).toHaveProperty('contributionScore', 5);
      expect(shaped.stats).not.toHaveProperty('volunteer_profile_id');
      expect(shaped.latestDigest).toHaveProperty('volunteerProfileId', setup.profile.id);
      expect(shaped.latestDigest).toHaveProperty('previewText', 'preview');
      expect(shaped.latestDigest).not.toHaveProperty('volunteer_profile_id');

      const updatedProfile = await repo.updateVolunteerProfileAdminRelational({ profileId: setup.profile.id, displayName: 'Admin Name', privacyMode: 'public_named', publicProfileEnabled: true });
      expect(updatedProfile.displayName).toBe('Admin Name');
      const team = await repo.createTeamAdminRelational({ name: 'Admin Team', description: 'D', visibility: 'public', createdByVolunteerProfileId: setup.profile.id });
      expect(team.slug).toBe('admin-team');
      const membership = await repo.setTeamMembershipAdminRelational({ teamId: team.id, volunteerProfileId: setup.profile.id, role: 'captain', status: 'active' });
      expect(membership.role).toBe('captain');
      await repo.moderatePublicTargetRelational({ targetType: 'volunteer_profile', targetId: setup.profile.id, moderationStatus: 'hidden', note: 'test' });
      expect((await pool.query('SELECT public_profile_enabled, moderation_status FROM volunteer_profiles WHERE id=$1', [setup.profile.id])).rows[0]).toMatchObject({ public_profile_enabled: false, moderation_status: 'hidden' });

      await repo.ingestSourcesRelational({ projectSlug: 'g', projectName: 'G', projectDescription: 'D', sources: [{ title: 'A', sourceText: 'alpha', sourceCitation: 'cite', sourceUrl: 'https://example.com/gamification-state' }], extractor: 'local-llm-v1' });
      const packet = (await pool.query("UPDATE work_packets SET status='claimed' WHERE source_url='https://example.com/gamification-state' RETURNING id")).rows[0];
      const claim = (await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes') RETURNING id", [packet.id, registration.node.id])).rows[0];
      await pool.query("INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,summary,validated,format_validated,consensus_status,review_status,validation_errors,warnings,submitted_at,provenance) VALUES(gen_random_uuid(),$1,$2,$3,'Local LLM v1','h','ok',true,true,'consensus_pending','not_reviewed','[]','[]',NOW(),jsonb_build_object('workerVersion','0.1.0','extractorVersion','Local LLM v1','promptVersion','test','promptHash','hash','packetSchemaVersion','work-packet-v1','extractionTimestamp',NOW()::text,'workerPlatform','linux','workerCapabilities',jsonb_build_array(),'resultValidationVersion','format-validation-v1'))", [packet.id, registration.node.id, claim.id]);
      const summary = await repo.recomputeGamificationRelational();
      expect(summary.profilesUpdated).toBeGreaterThanOrEqual(1);
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_claims WHERE status='claimed'")).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM extraction_results')).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_profile_nodes WHERE volunteer_profile_id=$1 AND detached_at IS NULL', [setup.profile.id])).rows[0].count)).toBe(1);
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM audit_events WHERE action='public_moderation.updated'")).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
      delete process.env.OPENCAUSE_HOSTED;
    }
  });

});

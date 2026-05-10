import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { hashText, type AuditEvent, type IngestionRun, type Project, type VolunteerEnrollment, type VolunteerNode, type WorkerControlConfig, type WorkPacketPayload } from '@opencause/shared';
import { createNodeToken, hashNodeToken } from './node-auth';
import { hashEnrollmentCode } from './coordinator';
import { hashProfileSetupToken } from './gamification/profile-setup';
import { signWorkPacketPayload } from './signing';
import { isHostedMode } from './runtime-config';
import { loadDb } from './db';
import { recomputeGamification } from './gamification/recompute';

type IngestSource = { title: string; sourceText: string; sourceCitation: string; sourceUrl: string; sourcePublishedAt?: string };

type WorkerControlUpdate = Partial<Pick<WorkerControlConfig, 'paused' | 'idleMode' | 'minIdleSeconds' | 'maxCpuPercent'>>;

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

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}


function projectFromRow(row: any): Project {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, status: row.status, createdAt: iso(row.created_at)! };
}

function ingestionRunFromRow(row: any): IngestionRun {
  return { id: row.id, sourceType: row.source_type, mode: row.mode, status: row.status, query: row.query, retmax: Number(row.retmax), startedAt: iso(row.started_at)!, completedAt: iso(row.completed_at), fetchedCount: Number(row.fetched_count), skippedCount: Number(row.skipped_count), failedCount: Number(row.failed_count), failureReasons: row.failure_reasons ?? [], packetsCreated: Number(row.packets_created), packetsSkipped: Number(row.packets_skipped), usedNcbiEmail: Boolean(row.used_ncbi_email), usedNcbiApiKey: Boolean(row.used_ncbi_api_key) };
}

export type StartIngestionRunRelationalInput = Pick<IngestionRun, 'sourceType' | 'mode' | 'query' | 'retmax' | 'usedNcbiEmail' | 'usedNcbiApiKey'>;
export type CompleteIngestionRunRelationalInput = Partial<Pick<IngestionRun, 'fetchedCount' | 'skippedCount' | 'failedCount' | 'failureReasons' | 'packetsCreated' | 'packetsSkipped'>> & { status?: IngestionRun['status'] };

function nodeFromRow(row: any): VolunteerNode {
  return {
    id: row.id,
    nodeName: row.node_name,
    platform: row.platform,
    version: row.version,
    status: row.status,
    capabilities: row.capabilities ?? [],
    registeredAt: iso(row.registered_at)!,
    lastHeartbeatAt: iso(row.last_heartbeat_at),
    nodeTokenHash: row.node_token_hash,
    enrollmentCodeHash: row.enrollment_code_hash,
    revokedAt: iso(row.revoked_at),
    suspendedAt: iso(row.suspended_at)
  } as VolunteerNode;
}

function enrollmentFromRow(row: any): VolunteerEnrollment {
  return {
    id: row.id,
    email: row.email,
    enrollmentCodeHash: row.enrollment_code_hash,
    status: row.status,
    createdAt: iso(row.created_at)!,
    usedAt: iso(row.used_at),
    nodeId: row.node_id,
    source: row.source
  };
}

function requiredEnrollmentCodes(): string[] {
  return (process.env.NODE_ENROLLMENT_CODES || process.env.NODE_ENROLLMENT_CODE || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
}

function controlFromRow(row: any): WorkerControlConfig {
  return {
    paused: Boolean(row.paused),
    idleMode: row.idle_mode,
    minIdleSeconds: Number(row.min_idle_seconds),
    maxCpuPercent: Number(row.max_cpu_percent),
    runNowToken: Number(row.run_now_token),
    updatedAt: iso(row.updated_at)!
  };
}

export async function appendAuditEventRelational(input: Omit<AuditEvent, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }, client?: PoolClient): Promise<AuditEvent | undefined> {
  if (!client && !enabled()) return undefined;
  const ownClient = !client;
  const c = client ?? (await getPool().connect());
  try {
    const event: AuditEvent = { id: randomUUID(), createdAt: new Date().toISOString(), metadata: {}, ...input };
    await c.query(
      'INSERT INTO audit_events(id,actor_type,actor_id,action,target_type,target_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [event.id, event.actorType, event.actorId ?? null, event.action, event.targetType ?? null, event.targetId ?? null, event.metadata ?? {}, event.createdAt]
    );
    return event;
  } finally {
    if (ownClient) c.release();
  }
}

async function assertNodeAuthorized(client: PoolClient, nodeId: string, token: string | null): Promise<any> {
  if (!token) throw new Error('node_unauthorized');
  const row = (await client.query('SELECT * FROM volunteer_nodes WHERE id = $1', [nodeId])).rows[0];
  if (!row) throw new Error('node_not_found');
  if (row.status === 'revoked') throw new Error('node_revoked');
  if (row.status === 'suspended') throw new Error('node_suspended');
  if (!row.node_token_hash || row.node_token_hash !== hashNodeToken(token)) throw new Error('node_unauthorized');
  return row;
}

export async function registerNodeRelational(input: { nodeName: string; platform: string; version: string; capabilities: string[]; enrollmentCode?: string }): Promise<{ node: VolunteerNode; nodeToken: string; profileSetupToken?: string } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let enrollmentCodeHash: string | undefined;
    let enrollmentId: string | undefined;
    const allowedEnvCodes = requiredEnrollmentCodes();
    if (input.enrollmentCode) {
      enrollmentCodeHash = hashEnrollmentCode(input.enrollmentCode);
      const enrollment = (await client.query('SELECT * FROM volunteer_enrollments WHERE enrollment_code_hash = $1 FOR UPDATE', [enrollmentCodeHash])).rows[0];
      if (enrollment) {
        if (enrollment.status !== 'issued') throw new Error('enrollment_code_used_or_revoked');
        enrollmentId = enrollment.id;
      } else if (!allowedEnvCodes.includes(input.enrollmentCode)) {
        throw new Error('invalid_enrollment_code');
      }
    } else if (allowedEnvCodes.length > 0) {
      throw new Error('invalid_enrollment_code');
    } else if (isHostedMode()) {
      throw new Error('enrollment_not_configured');
    }
    const now = new Date().toISOString();
    const nodeToken = createNodeToken();
    const nodeId = randomUUID();
    const nodeRow = (await client.query(
      `INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash,enrollment_code_hash,revoked_at,suspended_at)
       VALUES($1,$2,$3,$4,'online',$5,$6,$6,$7,$8,NULL,NULL) RETURNING *`,
      [nodeId, input.nodeName, input.platform, input.version, JSON.stringify(input.capabilities), now, hashNodeToken(nodeToken), enrollmentCodeHash ?? null]
    )).rows[0];
    if (enrollmentId) {
      await client.query("UPDATE volunteer_enrollments SET status = 'used', used_at = $2, node_id = $3 WHERE id = $1", [enrollmentId, now, nodeId]);
    }

    const profileId = randomUUID();
    const profileCount = Number((await client.query('SELECT COUNT(*)::int AS count FROM volunteer_profiles')).rows[0]?.count ?? 0) + 1;
    const displayName = `Volunteer ${String(profileCount).padStart(4, '0')}`;
    const baseSlug = `volunteer-${String(profileCount).padStart(4, '0')}`;
    const profileSetupToken = `ocp_${randomBytes(24).toString('base64url')}`;
    await client.query(
      `INSERT INTO volunteer_profiles(id,display_name,slug,privacy_mode,public_profile_enabled,moderation_status,avatar_color,bio,joined_at,last_active_at,stats_updated_at,created_at,updated_at,setup_token_hash,setup_token_expires_at)
       VALUES($1,$2,$3,'private',false,'ok','#38bdf8',NULL,$4,$4,NULL,$4,$4,$5,$6)`,
      [profileId, displayName, baseSlug, now, hashProfileSetupToken(profileSetupToken), new Date(Date.now() + 30 * 86_400_000).toISOString()]
    );
    await client.query('INSERT INTO volunteer_profile_nodes(id,volunteer_profile_id,node_id,attached_at,detached_at) VALUES($1,$2,$3,$4,NULL)', [randomUUID(), profileId, nodeId, now]);
    await appendAuditEventRelational({ actorType: 'node', actorId: nodeId, action: 'node.registered', targetType: 'node', targetId: nodeId, metadata: { platform: input.platform, version: input.version, capabilities: input.capabilities } }, client);
    await client.query('COMMIT');
    return { node: nodeFromRow(nodeRow), nodeToken, profileSetupToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatNodeRelational(nodeId: string, token: string | null): Promise<VolunteerNode | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await assertNodeAuthorized(client, nodeId, token);
    const row = (await client.query("UPDATE volunteer_nodes SET status = 'online', last_heartbeat_at = NOW() WHERE id = $1 RETURNING *", [nodeId])).rows[0];
    await client.query('COMMIT');
    return nodeFromRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function issueVolunteerEnrollmentRelational(email: string, enrollmentCodeHash: string): Promise<VolunteerEnrollment | null | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const count = Number((await client.query("SELECT COUNT(*)::int AS count FROM volunteer_enrollments WHERE email = $1 AND status = 'issued'", [email])).rows[0]?.count ?? 0);
    if (count >= 3) { await client.query('ROLLBACK'); return null; }
    const row = (await client.query("INSERT INTO volunteer_enrollments(id,email,enrollment_code_hash,status,created_at,used_at,node_id,source) VALUES($1,$2,$3,'issued',NOW(),NULL,NULL,'public_signup') RETURNING *", [randomUUID(), email, enrollmentCodeHash])).rows[0];
    await appendAuditEventRelational({ actorType: 'system', action: 'volunteer_enrollment.issued', targetType: 'volunteer_enrollment', targetId: row.id, metadata: { email } }, client);
    await client.query('COMMIT');
    return enrollmentFromRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function updateVolunteerEnrollmentStatusRelational(enrollmentId: string, status: 'issued' | 'revoked'): Promise<VolunteerEnrollment | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = (await client.query('SELECT * FROM volunteer_enrollments WHERE id = $1 FOR UPDATE', [enrollmentId])).rows[0];
    if (!existing) throw new Error('enrollment_not_found');
    if (existing.status === 'used') throw new Error('enrollment_already_used');
    const row = (await client.query('UPDATE volunteer_enrollments SET status = $2 WHERE id = $1 RETURNING *', [enrollmentId, status])).rows[0];
    await appendAuditEventRelational({ actorType: 'admin', action: 'volunteer_enrollment.status.updated', targetType: 'volunteer_enrollment', targetId: enrollmentId, metadata: { status, email: row.email } }, client);
    await client.query('COMMIT');
    return enrollmentFromRow(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function recordVolunteerEnrollmentDeliveryRelational(enrollmentId: string, email: string, delivery: unknown, shownInBrowser: boolean): Promise<boolean | undefined> {
  const event = await appendAuditEventRelational({ actorType: 'system', action: 'volunteer_enrollment.delivery', targetType: 'volunteer_enrollment', targetId: enrollmentId, metadata: { email, delivery, shownInBrowser } });
  return event ? true : undefined;
}

export async function recordVolunteerChallengeFailedRelational(email: string, ip: string): Promise<boolean | undefined> {
  const event = await appendAuditEventRelational({ actorType: 'system', action: 'volunteer_enrollment.challenge_failed', targetType: 'volunteer_enrollment', metadata: { email, ip } });
  return event ? true : undefined;
}

export async function createPublicReportRelational(input: { targetType: 'volunteer_profile' | 'team' | 'impact_card'; targetSlug?: string; reason: string; details?: string; reporterContact?: string }) {
  if (!enabled()) return undefined;
  const row = (await getPool().query(
    "INSERT INTO public_reports(id,target_type,target_id,target_slug,reason,details,reporter_contact,status,created_at,reviewed_at) VALUES($1,$2,NULL,$3,$4,$5,$6,'open',NOW(),NULL) RETURNING *",
    [randomUUID(), input.targetType, input.targetSlug ?? null, input.reason, input.details ?? '', input.reporterContact ?? null]
  )).rows[0];
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, targetSlug: row.target_slug, reason: row.reason, details: row.details, reporterContact: row.reporter_contact, status: row.status, createdAt: iso(row.created_at)!, reviewedAt: iso(row.reviewed_at) };
}

export async function getWorkerControlRelational(): Promise<WorkerControlConfig | undefined> {
  if (!enabled()) return undefined;
  const row = (await getPool().query('SELECT * FROM worker_control WHERE id = 1')).rows[0] ?? (await getPool().query("INSERT INTO worker_control(id,paused,idle_mode,min_idle_seconds,max_cpu_percent,run_now_token,updated_at) VALUES(1,false,'user-and-cpu',120,35,0,NOW()) RETURNING *")).rows[0];
  return controlFromRow(row);
}

export async function updateWorkerControlRelational(update: WorkerControlUpdate): Promise<WorkerControlConfig | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO worker_control(id,paused,idle_mode,min_idle_seconds,max_cpu_percent,run_now_token,updated_at) VALUES(1,false,'user-and-cpu',120,35,0,NOW()) ON CONFLICT (id) DO NOTHING");
    const current = (await client.query('SELECT * FROM worker_control WHERE id = 1 FOR UPDATE')).rows[0];
    const next = { paused: update.paused ?? current.paused, idleMode: update.idleMode ?? current.idle_mode, minIdleSeconds: update.minIdleSeconds ?? current.min_idle_seconds, maxCpuPercent: update.maxCpuPercent ?? current.max_cpu_percent };
    const row = (await client.query('UPDATE worker_control SET paused=$1,idle_mode=$2,min_idle_seconds=$3,max_cpu_percent=$4,updated_at=NOW() WHERE id=1 RETURNING *', [next.paused, next.idleMode, next.minIdleSeconds, next.maxCpuPercent])).rows[0];
    await appendAuditEventRelational({ actorType: 'admin', action: 'worker_control.updated', targetType: 'worker_control', targetId: 'singleton', metadata: update as Record<string, unknown> }, client);
    await client.query('COMMIT');
    return controlFromRow(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function triggerRunNowRelational(): Promise<WorkerControlConfig | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO worker_control(id,paused,idle_mode,min_idle_seconds,max_cpu_percent,run_now_token,updated_at) VALUES(1,false,'user-and-cpu',120,35,0,NOW()) ON CONFLICT (id) DO NOTHING");
    const row = (await client.query('UPDATE worker_control SET run_now_token = run_now_token + 1, updated_at = NOW() WHERE id=1 RETURNING *')).rows[0];
    await appendAuditEventRelational({ actorType: 'admin', action: 'worker_control.run_now', targetType: 'worker_control', targetId: 'singleton', metadata: { runNowToken: Number(row.run_now_token) } }, client);
    await client.query('COMMIT');
    return controlFromRow(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function updateNodeStatusRelational(nodeId: string, status: 'online' | 'offline' | 'suspended' | 'revoked'): Promise<VolunteerNode | null | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `UPDATE volunteer_nodes
       SET status = $2,
           revoked_at = CASE WHEN $2 = 'revoked' THEN NOW() ELSE revoked_at END,
           suspended_at = CASE WHEN $2 = 'suspended' THEN NOW() ELSE suspended_at END
       WHERE id = $1
       RETURNING *`,
      [nodeId, status]
    )).rows[0];
    if (!row) { await client.query('ROLLBACK'); return null; }
    await appendAuditEventRelational({ actorType: 'admin', action: 'node.status.updated', targetType: 'node', targetId: nodeId, metadata: { status } }, client);
    await client.query('COMMIT');
    return nodeFromRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function queueSnapshotRelational(): Promise<{ totalPackets: number; queuedPackets: number; availableToFirstPass: number; awaitingIndependentValidation: number; completedPackets: number; claimedPackets: number } | undefined> {
  if (!enabled()) return undefined;
  const result = await getPool().query(`SELECT
    COUNT(*)::int AS total_packets,
    COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_packets,
    COUNT(*) FILTER (WHERE status = 'queued' AND NOT EXISTS (SELECT 1 FROM extraction_results r WHERE r.work_packet_id = work_packets.id))::int AS available_to_first_pass,
    COUNT(*) FILTER (WHERE status = 'queued' AND EXISTS (SELECT 1 FROM extraction_results r WHERE r.work_packet_id = work_packets.id))::int AS awaiting_independent_validation,
    COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_packets,
    COUNT(*) FILTER (WHERE status = 'claimed')::int AS claimed_packets
    FROM work_packets`);
  const row = result.rows[0];
  return { totalPackets: Number(row.total_packets), queuedPackets: Number(row.queued_packets), availableToFirstPass: Number(row.available_to_first_pass), awaitingIndependentValidation: Number(row.awaiting_independent_validation), completedPackets: Number(row.completed_packets), claimedPackets: Number(row.claimed_packets) };
}

export async function startIngestionRunRelational(input: StartIngestionRunRelationalInput): Promise<IngestionRun | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const run = (await client.query(`INSERT INTO ingestion_runs(id,source_type,mode,status,query,retmax,started_at,completed_at,fetched_count,skipped_count,failed_count,failure_reasons,packets_created,packets_skipped,used_ncbi_email,used_ncbi_api_key)
      VALUES($1,$2,$3,'running',$4,$5,NOW(),NULL,0,0,0,'[]'::jsonb,0,0,$6,$7) RETURNING *`, [randomUUID(), input.sourceType, input.mode, input.query, input.retmax, input.usedNcbiEmail, input.usedNcbiApiKey])).rows[0];
    await appendAuditEventRelational({ actorType: input.mode === 'cron' ? 'cron' : 'admin', action: 'ingestion.started', targetType: 'ingestion_run', targetId: run.id, metadata: { sourceType: input.sourceType, query: input.query, retmax: input.retmax } }, client);
    await client.query('COMMIT');
    return ingestionRunFromRow(run);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function completeIngestionRunRelational(runId: string, input: CompleteIngestionRunRelationalInput): Promise<IngestionRun | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = (await client.query('SELECT * FROM ingestion_runs WHERE id = $1 FOR UPDATE', [runId])).rows[0];
    if (!existing) throw new Error('ingestion_run_not_found');
    const status = input.status ?? (input.failedCount && input.failedCount > 0 ? 'partial_failed' : 'completed');
    const row = (await client.query(`UPDATE ingestion_runs SET status=$2, completed_at=NOW(), fetched_count=$3, skipped_count=$4, failed_count=$5, failure_reasons=$6, packets_created=$7, packets_skipped=$8 WHERE id=$1 RETURNING *`, [runId, status, input.fetchedCount ?? existing.fetched_count, input.skippedCount ?? existing.skipped_count, input.failedCount ?? existing.failed_count, JSON.stringify(input.failureReasons ?? existing.failure_reasons ?? []), input.packetsCreated ?? existing.packets_created, input.packetsSkipped ?? existing.packets_skipped])).rows[0];
    await appendAuditEventRelational({ actorType: row.mode === 'cron' ? 'cron' : 'admin', action: `ingestion.${row.status}`, targetType: 'ingestion_run', targetId: row.id, metadata: { sourceType: row.source_type, fetchedCount: Number(row.fetched_count), skippedCount: Number(row.skipped_count), failedCount: Number(row.failed_count), packetsCreated: Number(row.packets_created), packetsSkipped: Number(row.packets_skipped) } }, client);
    await client.query('COMMIT');
    return ingestionRunFromRow(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function ingestSourcesRelational(input: { projectSlug: string; projectName: string; projectDescription: string; sources: IngestSource[]; extractor?: 'local-llm-v1' | 'mock-extractor-v1' }): Promise<{ project: Project; packetsCreated: number; packetsSkipped: number } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let project = (await client.query('SELECT * FROM projects WHERE slug = $1 FOR UPDATE', [input.projectSlug])).rows[0];
    if (!project) project = (await client.query("INSERT INTO projects(id,slug,name,description,status,created_at) VALUES($1,$2,$3,$4,'active',NOW()) RETURNING *", [randomUUID(), input.projectSlug, input.projectName, input.projectDescription])).rows[0];
    let packetsCreated = 0;
    let packetsSkipped = 0;
    const extractor = input.extractor ?? 'local-llm-v1';
    for (const source of input.sources) {
      const exists = (await client.query('SELECT 1 FROM work_packets WHERE project_id = $1 AND source_url = $2 LIMIT 1', [project.id, source.sourceUrl])).rowCount;
      if (exists) { packetsSkipped += 1; continue; }
      const now = new Date().toISOString();
      const payload: WorkPacketPayload = { id: randomUUID(), projectId: project.id, title: source.title, sourceText: source.sourceText, sourceCitation: source.sourceCitation, sourceUrl: source.sourceUrl, sourcePublishedAt: source.sourcePublishedAt, inputHash: hashText(source.sourceText), extractor, createdAt: now };
      const signature = signWorkPacketPayload(payload);
      await client.query("INSERT INTO work_packets(id,project_id,title,source_text,source_citation,source_url,source_published_at,input_hash,extractor,signature,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',$11,$11)", [payload.id, payload.projectId, payload.title, payload.sourceText, payload.sourceCitation, payload.sourceUrl, payload.sourcePublishedAt ?? null, payload.inputHash, payload.extractor, signature, now]);
      packetsCreated += 1;
    }
    await client.query('COMMIT');
    return { project: projectFromRow(project), packetsCreated, packetsSkipped };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

function profileFromRow(row: any) {
  return { id: row.id, displayName: row.display_name, slug: row.slug, privacyMode: row.privacy_mode, publicProfileEnabled: Boolean(row.public_profile_enabled), avatarColor: row.avatar_color, bio: row.bio ?? undefined, setupTokenHash: row.setup_token_hash ?? undefined, setupTokenExpiresAt: iso(row.setup_token_expires_at), moderationStatus: row.moderation_status ?? 'ok', moderationNote: row.moderation_note ?? undefined, joinedAt: iso(row.joined_at)!, lastActiveAt: iso(row.last_active_at), statsUpdatedAt: iso(row.stats_updated_at), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}

function volunteerStatsFromRow(row: any) {
  if (!row) return null;
  return { id: row.id, volunteerProfileId: row.volunteer_profile_id, window: row.stats_window, windowStart: iso(row.window_start), windowEnd: iso(row.window_end), contributionScore: Number(row.contribution_score), sectionsProcessed: Number(row.sections_processed), packetsSubmitted: Number(row.packets_submitted), formatValidatedSubmissions: Number(row.format_validated_submissions), formatRejectedSubmissions: Number(row.format_rejected_submissions), consensusPassedContributions: Number(row.consensus_passed_contributions), consensusFailedContributions: Number(row.consensus_failed_contributions), humanReviewedAcceptedContributions: Number(row.human_reviewed_accepted_contributions), idleMinutesDonated: Number(row.idle_minutes_donated), distinctActiveDays: Number(row.distinct_active_days), currentStreakDays: Number(row.current_streak_days), longestStreakDays: Number(row.longest_streak_days), badgesCount: Number(row.badges_count), computedAt: iso(row.computed_at)! };
}

function impactDigestFromRow(row: any) {
  if (!row) return null;
  return { id: row.id, volunteerProfileId: row.volunteer_profile_id, periodStart: iso(row.period_start)!, periodEnd: iso(row.period_end)!, sectionsProcessed: Number(row.sections_processed), formatValidatedSubmissions: Number(row.format_validated_submissions), consensusPassedContributions: Number(row.consensus_passed_contributions), idleMinutesDonated: Number(row.idle_minutes_donated), badgesAwarded: Number(row.badges_awarded), teamRank: row.team_rank === null || row.team_rank === undefined ? null : Number(row.team_rank), previewText: row.preview_text, createdAt: iso(row.created_at)!, deliveredAt: iso(row.delivered_at) };
}

async function profileBySetupToken(client: PoolClient, token: string): Promise<any> {
  const hash = hashProfileSetupToken(token);
  const profile = (await client.query('SELECT * FROM volunteer_profiles WHERE setup_token_hash = $1 AND (setup_token_expires_at IS NULL OR setup_token_expires_at > NOW())', [hash])).rows[0];
  if (!profile) throw new Error('invalid_or_expired_profile_setup_token');
  return profile;
}

export async function readProfileSetupRelational(token: string): Promise<any | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    const profileRow = await profileBySetupToken(client, token);
    const profile = profileFromRow(profileRow);
    const [stats, digest, cards, badges, teams] = await Promise.all([
      client.query("SELECT * FROM volunteer_stats_snapshots WHERE volunteer_profile_id = $1 AND stats_window = 'all_time' LIMIT 1", [profile.id]),
      client.query('SELECT * FROM impact_digests WHERE volunteer_profile_id = $1 ORDER BY period_start DESC LIMIT 1', [profile.id]),
      client.query('SELECT slug,title FROM impact_cards WHERE volunteer_profile_id = $1 AND public_enabled = true', [profile.id]),
      client.query('SELECT badge_slug, awarded_at FROM volunteer_badges WHERE volunteer_profile_id = $1', [profile.id]),
      client.query("SELECT id,name,slug,description FROM teams WHERE visibility = 'public' ORDER BY created_at")
    ]);
    return {
      profile: { id: profile.id, displayName: profile.displayName, slug: profile.slug, privacyMode: profile.privacyMode, publicProfileEnabled: profile.publicProfileEnabled, avatarColor: profile.avatarColor, bio: profile.bio ?? '' },
      stats: volunteerStatsFromRow(stats.rows[0]),
      latestDigest: impactDigestFromRow(digest.rows[0]),
      impactCards: cards.rows.map((row) => ({ slug: row.slug, title: row.title })),
      badges: badges.rows.map((row) => ({ slug: row.badge_slug, awardedAt: iso(row.awarded_at)! })),
      teams: teams.rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, description: row.description }))
    };
  } finally { client.release(); }
}

export async function updateProfileSetupRelational(input: { token: string; displayName?: string; privacyMode?: 'private' | 'public_anonymous' | 'public_named'; publicProfileEnabled?: boolean; bio?: string; avatarColor?: string; teamId?: string | null }): Promise<any | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = await profileBySetupToken(client, input.token);
    let displayName = existing.display_name;
    if (input.displayName !== undefined) displayName = input.displayName.trim().slice(0, 80) || existing.display_name;
    const privacyMode = input.privacyMode ?? existing.privacy_mode;
    let publicProfileEnabled = input.publicProfileEnabled ?? existing.public_profile_enabled;
    if (privacyMode === 'private') publicProfileEnabled = false;
    const bio = input.bio !== undefined ? input.bio.trim().slice(0, 240) : existing.bio;
    const avatarColor = input.avatarColor !== undefined ? (input.avatarColor.trim().slice(0, 32) || existing.avatar_color) : existing.avatar_color;
    const row = (await client.query('UPDATE volunteer_profiles SET display_name=$2, privacy_mode=$3, public_profile_enabled=$4, bio=$5, avatar_color=$6, updated_at=NOW() WHERE id=$1 RETURNING *', [existing.id, displayName, privacyMode, publicProfileEnabled, bio, avatarColor])).rows[0];
    if (input.teamId !== undefined) {
      await client.query("UPDATE team_memberships SET status='left', left_at=NOW() WHERE volunteer_profile_id=$1 AND status='active'", [existing.id]);
      if (input.teamId) {
        const team = (await client.query("SELECT * FROM teams WHERE id=$1 AND visibility='public'", [input.teamId])).rows[0];
        if (!team) throw new Error('team_not_found');
        await client.query("INSERT INTO team_memberships(id,team_id,volunteer_profile_id,role,status,joined_at,left_at) VALUES($1,$2,$3,'member','active',NOW(),NULL) ON CONFLICT (team_id, volunteer_profile_id) DO UPDATE SET status='active', role='member', joined_at=NOW(), left_at=NULL", [randomUUID(), input.teamId, existing.id]);
      }
    }
    await client.query('COMMIT');
    return profileFromRow(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function updateVolunteerProfileAdminRelational(input: { profileId: string; displayName?: string; privacyMode?: 'private' | 'public_anonymous' | 'public_named'; publicProfileEnabled?: boolean; bio?: string; avatarColor?: string }): Promise<any | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    const existing = (await client.query('SELECT * FROM volunteer_profiles WHERE id=$1', [input.profileId])).rows[0];
    if (!existing) throw new Error('volunteer_profile_not_found');
    let displayName = existing.display_name;
    if (input.displayName !== undefined) displayName = input.displayName.trim().slice(0, 80) || existing.display_name;
    const privacyMode = input.privacyMode ?? existing.privacy_mode;
    let publicProfileEnabled = input.publicProfileEnabled ?? existing.public_profile_enabled;
    if (privacyMode === 'private') publicProfileEnabled = false;
    const bio = input.bio !== undefined ? input.bio.trim().slice(0, 240) : existing.bio;
    const avatarColor = input.avatarColor !== undefined ? (input.avatarColor.trim().slice(0, 32) || existing.avatar_color) : existing.avatar_color;
    const row = (await client.query('UPDATE volunteer_profiles SET display_name=$2, privacy_mode=$3, public_profile_enabled=$4, bio=$5, avatar_color=$6, updated_at=NOW() WHERE id=$1 RETURNING *', [input.profileId, displayName, privacyMode, publicProfileEnabled, bio, avatarColor])).rows[0];
    return profileFromRow(row);
  } finally {
    client.release();
  }
}

function slugifyRel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'team';
}

async function uniqueTeamSlug(client: PoolClient, name: string): Promise<string> {
  const root = slugifyRel(name);
  let slug = root;
  let suffix = 2;
  while ((await client.query('SELECT 1 FROM teams WHERE slug=$1', [slug])).rowCount) slug = `${root}-${suffix++}`;
  return slug;
}

function teamFromRow(row: any) {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description ?? '', visibility: row.visibility, createdByVolunteerProfileId: row.created_by_volunteer_profile_id, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!, statsUpdatedAt: iso(row.stats_updated_at), moderationStatus: row.moderation_status ?? 'ok', moderationNote: row.moderation_note ?? undefined };
}

function membershipFromRow(row: any) {
  return { id: row.id, teamId: row.team_id, volunteerProfileId: row.volunteer_profile_id, role: row.role, status: row.status, joinedAt: iso(row.joined_at)!, leftAt: iso(row.left_at) };
}

export async function createTeamAdminRelational(input: { name: string; description?: string; visibility?: 'public' | 'private'; createdByVolunteerProfileId?: string }): Promise<any | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const name = input.name.trim().slice(0, 100);
    if (!name) throw new Error('team_name_required');
    if (input.createdByVolunteerProfileId && !(await client.query('SELECT 1 FROM volunteer_profiles WHERE id=$1', [input.createdByVolunteerProfileId])).rowCount) throw new Error('volunteer_profile_not_found');
    const slug = await uniqueTeamSlug(client, name);
    const team = (await client.query("INSERT INTO teams(id,name,slug,description,visibility,created_by_volunteer_profile_id,created_at,updated_at,stats_updated_at,moderation_status,moderation_note) VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW(),NULL,'ok',NULL) RETURNING *", [randomUUID(), name, slug, input.description?.trim().slice(0, 500) ?? '', input.visibility ?? 'public', input.createdByVolunteerProfileId ?? null])).rows[0];
    if (input.createdByVolunteerProfileId) await client.query("INSERT INTO team_memberships(id,team_id,volunteer_profile_id,role,status,joined_at,left_at) VALUES($1,$2,$3,'captain','active',NOW(),NULL)", [randomUUID(), team.id, input.createdByVolunteerProfileId]);
    await client.query('COMMIT');
    return teamFromRow(team);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setTeamMembershipAdminRelational(input: { teamId: string; volunteerProfileId: string; role?: 'member' | 'captain'; status?: 'active' | 'left' | 'removed' }): Promise<any | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (!(await client.query('SELECT 1 FROM teams WHERE id=$1', [input.teamId])).rowCount) throw new Error('team_not_found');
    if (!(await client.query('SELECT 1 FROM volunteer_profiles WHERE id=$1', [input.volunteerProfileId])).rowCount) throw new Error('volunteer_profile_not_found');
    let row = (await client.query('SELECT * FROM team_memberships WHERE team_id=$1 AND volunteer_profile_id=$2 FOR UPDATE', [input.teamId, input.volunteerProfileId])).rows[0];
    if (!row) {
      row = (await client.query("INSERT INTO team_memberships(id,team_id,volunteer_profile_id,role,status,joined_at,left_at) VALUES($1,$2,$3,$4,$5,NOW(),CASE WHEN $5='active' THEN NULL ELSE NOW() END) RETURNING *", [randomUUID(), input.teamId, input.volunteerProfileId, input.role ?? 'member', input.status ?? 'active'])).rows[0];
    } else {
      row = (await client.query("UPDATE team_memberships SET role=$2,status=$3,left_at=CASE WHEN $3='active' THEN NULL ELSE NOW() END WHERE id=$1 RETURNING *", [row.id, input.role ?? row.role, input.status ?? row.status])).rows[0];
    }
    await client.query('COMMIT');
    return membershipFromRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function moderatePublicTargetRelational(input: { targetType: 'volunteer_profile' | 'team' | 'impact_card'; targetId: string; moderationStatus: 'ok' | 'hidden' | 'flagged'; note?: string }): Promise<{ ok: true } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let result;
    if (input.targetType === 'volunteer_profile') {
      result = await client.query("UPDATE volunteer_profiles SET moderation_status=$2, moderation_note=$3, public_profile_enabled=CASE WHEN $2='hidden' THEN false ELSE public_profile_enabled END, updated_at=NOW() WHERE id=$1 RETURNING id", [input.targetId, input.moderationStatus, input.note ?? null]);
    } else if (input.targetType === 'team') {
      result = await client.query('UPDATE teams SET moderation_status=$2, moderation_note=$3, updated_at=NOW() WHERE id=$1 RETURNING id', [input.targetId, input.moderationStatus, input.note ?? null]);
    } else {
      result = await client.query("UPDATE impact_cards SET moderation_status=$2, moderation_note=$3, public_enabled=CASE WHEN $2='hidden' THEN false ELSE public_enabled END WHERE id=$1 RETURNING id", [input.targetId, input.moderationStatus, input.note ?? null]);
    }
    if (!result.rowCount) throw new Error('target_not_found');
    await appendAuditEventRelational({ actorType: 'admin', action: 'public_moderation.updated', targetType: input.targetType, targetId: input.targetId, metadata: { moderationStatus: input.moderationStatus, note: input.note } }, client);
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recomputeGamificationRelational(): Promise<{ profilesUpdated: number; teamsUpdated: number; badgesAwarded: number; badgeDefinitionsSeeded: number } | undefined> {
  if (!enabled()) return undefined;
  const db = await loadDb();
  const summary = recomputeGamification(db);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM impact_cards');
    await client.query('DELETE FROM impact_digests');
    await client.query('DELETE FROM team_stats_snapshots');
    await client.query('DELETE FROM volunteer_stats_snapshots');
    await client.query('DELETE FROM volunteer_badges');
    await client.query('DELETE FROM badge_definitions');
    for (const profile of db.volunteerProfiles) {
      await client.query('UPDATE volunteer_profiles SET last_active_at=$2, stats_updated_at=$3, updated_at=$4 WHERE id=$1', [profile.id, profile.lastActiveAt, profile.statsUpdatedAt, profile.updatedAt]);
    }
    for (const team of db.teams) {
      await client.query('UPDATE teams SET stats_updated_at=$2, updated_at=$3 WHERE id=$1', [team.id, team.statsUpdatedAt, team.updatedAt]);
    }
    for (const definition of db.badgeDefinitions) {
      await client.query('INSERT INTO badge_definitions(id,slug,name,description,category,criteria_kind,criteria_value,icon_name,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [definition.id, definition.slug, definition.name, definition.description, definition.category, definition.criteriaKind, definition.criteriaValue, definition.iconName, definition.createdAt]);
    }
    for (const badge of db.volunteerBadges) {
      await client.query('INSERT INTO volunteer_badges(id,volunteer_profile_id,badge_slug,awarded_at,source_kind,source_id) VALUES($1,$2,$3,$4,$5,$6)', [badge.id, badge.volunteerProfileId, badge.badgeSlug, badge.awardedAt, badge.sourceKind, badge.sourceId]);
    }
    for (const stats of db.volunteerStatsSnapshots) {
      await client.query('INSERT INTO volunteer_stats_snapshots(id,volunteer_profile_id,stats_window,window_start,window_end,contribution_score,sections_processed,packets_submitted,format_validated_submissions,format_rejected_submissions,consensus_passed_contributions,consensus_failed_contributions,human_reviewed_accepted_contributions,idle_minutes_donated,distinct_active_days,current_streak_days,longest_streak_days,badges_count,computed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)', [stats.id, stats.volunteerProfileId, stats.window, stats.windowStart, stats.windowEnd, stats.contributionScore, stats.sectionsProcessed, stats.packetsSubmitted, stats.formatValidatedSubmissions, stats.formatRejectedSubmissions, stats.consensusPassedContributions, stats.consensusFailedContributions, stats.humanReviewedAcceptedContributions, stats.idleMinutesDonated, stats.distinctActiveDays, stats.currentStreakDays, stats.longestStreakDays, stats.badgesCount, stats.computedAt]);
    }
    for (const stats of db.teamStatsSnapshots) {
      await client.query('INSERT INTO team_stats_snapshots(id,team_id,stats_window,window_start,window_end,contribution_score,sections_processed,packets_submitted,format_validated_submissions,format_rejected_submissions,consensus_passed_contributions,consensus_failed_contributions,human_reviewed_accepted_contributions,idle_minutes_donated,distinct_active_days,current_streak_days,longest_streak_days,member_count,active_member_count,computed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)', [stats.id, stats.teamId, stats.window, stats.windowStart, stats.windowEnd, stats.contributionScore, stats.sectionsProcessed, stats.packetsSubmitted, stats.formatValidatedSubmissions, stats.formatRejectedSubmissions, stats.consensusPassedContributions, stats.consensusFailedContributions, stats.humanReviewedAcceptedContributions, stats.idleMinutesDonated, stats.distinctActiveDays, stats.currentStreakDays, stats.longestStreakDays, stats.memberCount, stats.activeMemberCount, stats.computedAt]);
    }
    for (const digest of db.impactDigests) {
      await client.query('INSERT INTO impact_digests(id,volunteer_profile_id,period_start,period_end,sections_processed,format_validated_submissions,consensus_passed_contributions,idle_minutes_donated,badges_awarded,team_rank,preview_text,created_at,delivered_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [digest.id, digest.volunteerProfileId, digest.periodStart, digest.periodEnd, digest.sectionsProcessed, digest.formatValidatedSubmissions, digest.consensusPassedContributions, digest.idleMinutesDonated, digest.badgesAwarded, digest.teamRank, digest.previewText, digest.createdAt, digest.deliveredAt]);
    }
    for (const card of db.impactCards) {
      await client.query('INSERT INTO impact_cards(id,volunteer_profile_id,team_id,card_type,slug,title,subtitle,metric_label,metric_value,accent_color,public_enabled,moderation_status,moderation_note,period_start,period_end,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)', [card.id, card.volunteerProfileId, card.teamId, card.cardType, card.slug, card.title, card.subtitle, card.metricLabel, card.metricValue, card.accentColor, card.publicEnabled, card.moderationStatus ?? 'ok', card.moderationNote, card.periodStart, card.periodEnd, card.createdAt]);
    }
    await client.query('COMMIT');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

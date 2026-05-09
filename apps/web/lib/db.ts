import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema, type DatabaseState, type WorkerControlConfig } from '@opencause/shared';
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
  auditEvents: [],
  volunteerEnrollments: [],
  volunteerProfiles: [],
  volunteerProfileNodes: [],
  teams: [],
  teamMemberships: [],
  badgeDefinitions: [],
  volunteerBadges: [],
  volunteerStatsSnapshots: [],
  teamStatsSnapshots: [],
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

function shouldUseRelationalPostgres(): boolean {
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

async function ensurePostgresSchema(client: PoolClient): Promise<void> {
  if (pgInitialized) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS opencause_state (
      id INTEGER PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgInitialized = true;
}

async function loadDbFromRelational(client?: PoolClient): Promise<DatabaseState> {
  const ownClient = !client;
  const c = client ?? (await getPool().connect());
  try {
    const [projects, packets, nodes, claims, results, facts, workerControl, ingestionRuns, auditEvents, volunteerEnrollments, volunteerProfiles, volunteerProfileNodes, teams, teamMemberships, badgeDefinitions, volunteerBadges, volunteerStatsSnapshots, teamStatsSnapshots] = await Promise.all([
      c.query('SELECT * FROM projects ORDER BY created_at'),
      c.query('SELECT * FROM work_packets ORDER BY created_at'),
      c.query('SELECT * FROM volunteer_nodes ORDER BY registered_at'),
      c.query('SELECT * FROM work_claims ORDER BY claimed_at'),
      c.query('SELECT * FROM extraction_results ORDER BY submitted_at'),
      c.query('SELECT * FROM extracted_facts ORDER BY id'),
      c.query('SELECT * FROM worker_control WHERE id = 1'),
      c.query('SELECT * FROM ingestion_runs ORDER BY started_at DESC'),
      c.query('SELECT * FROM audit_events ORDER BY created_at DESC'),
      c.query('SELECT * FROM volunteer_enrollments ORDER BY created_at DESC'),
      c.query('SELECT * FROM volunteer_profiles ORDER BY joined_at'),
      c.query('SELECT * FROM volunteer_profile_nodes ORDER BY attached_at'),
      c.query('SELECT * FROM teams ORDER BY created_at'),
      c.query('SELECT * FROM team_memberships ORDER BY joined_at'),
      c.query('SELECT * FROM badge_definitions ORDER BY created_at, slug'),
      c.query('SELECT * FROM volunteer_badges ORDER BY awarded_at'),
      c.query('SELECT * FROM volunteer_stats_snapshots ORDER BY computed_at DESC'),
      c.query('SELECT * FROM team_stats_snapshots ORDER BY computed_at DESC')
    ]);

    const controlRow = workerControl.rows[0];
    const control: WorkerControlConfig = controlRow
      ? {
          paused: controlRow.paused,
          idleMode: controlRow.idle_mode,
          minIdleSeconds: Number(controlRow.min_idle_seconds),
          maxCpuPercent: Number(controlRow.max_cpu_percent),
          runNowToken: Number(controlRow.run_now_token),
          updatedAt: iso(controlRow.updated_at)!
        }
      : { ...EMPTY_DB.workerControl };

    return databaseSchema.parse({
      projects: projects.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: iso(row.created_at)!
      })),
      workPackets: packets.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        sourceText: row.source_text,
        sourceCitation: row.source_citation,
        sourceUrl: row.source_url,
        sourcePublishedAt: row.source_published_at ?? undefined,
        inputHash: row.input_hash,
        extractor: row.extractor,
        signature: row.signature,
        status: row.status,
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!
      })),
      nodes: nodes.rows.map((row) => ({
        id: row.id,
        nodeName: row.node_name,
        platform: row.platform,
        version: row.version,
        status: row.status,
        capabilities: row.capabilities ?? [],
        registeredAt: iso(row.registered_at)!,
        lastHeartbeatAt: iso(row.last_heartbeat_at),
        nodeTokenHash: row.node_token_hash ?? undefined,
        enrollmentCodeHash: row.enrollment_code_hash ?? undefined,
        suspendedAt: iso(row.suspended_at),
        revokedAt: iso(row.revoked_at)
      })),
      claims: claims.rows.map((row) => ({
        id: row.id,
        workPacketId: row.work_packet_id,
        nodeId: row.node_id,
        status: row.status,
        claimedAt: iso(row.claimed_at)!,
        leaseExpiresAt: iso(row.lease_expires_at)!,
        completedAt: iso(row.completed_at)
      })),
      results: results.rows.map((row) => ({
        id: row.id,
        workPacketId: row.work_packet_id,
        nodeId: row.node_id,
        claimId: row.claim_id,
        extractorVersion: row.extractor_version,
        resultHash: row.result_hash,
        validated: row.validated,
        formatValidated: row.format_validated,
        consensusStatus: row.consensus_status,
        reviewStatus: row.review_status,
        validationErrors: row.validation_errors ?? [],
        warnings: row.warnings ?? [],
        summary: row.summary,
        submittedAt: iso(row.submitted_at)!,
        provenance: row.provenance ?? undefined
      })),
      facts: facts.rows.map((row) => ({
        id: row.id,
        resultId: row.result_id,
        cancerType: row.cancer_type ?? undefined,
        geneOrBiomarker: row.gene_or_biomarker ?? undefined,
        drugOrCompound: row.drug_or_compound ?? undefined,
        relationshipType: row.relationship_type,
        evidenceSentence: row.evidence_sentence,
        confidence: Number(row.confidence),
        sourceCitation: row.source_citation,
        sourceUrl: row.source_url
      })),
      ingestionRuns: ingestionRuns.rows.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        mode: row.mode,
        status: row.status,
        query: row.query,
        retmax: Number(row.retmax),
        startedAt: iso(row.started_at)!,
        completedAt: iso(row.completed_at),
        fetchedCount: Number(row.fetched_count),
        skippedCount: Number(row.skipped_count),
        failedCount: Number(row.failed_count),
        failureReasons: row.failure_reasons ?? [],
        packetsCreated: Number(row.packets_created),
        packetsSkipped: Number(row.packets_skipped),
        usedNcbiEmail: row.used_ncbi_email,
        usedNcbiApiKey: row.used_ncbi_api_key
      })),
      volunteerEnrollments: volunteerEnrollments.rows.map((row) => ({
        id: row.id,
        email: row.email,
        enrollmentCodeHash: row.enrollment_code_hash,
        status: row.status,
        createdAt: iso(row.created_at)!,
        usedAt: iso(row.used_at),
        nodeId: row.node_id ?? undefined,
        source: row.source
      })),
      auditEvents: auditEvents.rows.map((row) => ({
        id: row.id,
        actorType: row.actor_type,
        actorId: row.actor_id ?? undefined,
        action: row.action,
        targetType: row.target_type ?? undefined,
        targetId: row.target_id ?? undefined,
        metadata: row.metadata ?? {},
        createdAt: iso(row.created_at)!
      })),
      volunteerProfiles: volunteerProfiles.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        slug: row.slug,
        privacyMode: row.privacy_mode,
        publicProfileEnabled: row.public_profile_enabled,
        avatarColor: row.avatar_color,
        bio: row.bio ?? undefined,
        joinedAt: iso(row.joined_at)!,
        lastActiveAt: iso(row.last_active_at),
        statsUpdatedAt: iso(row.stats_updated_at),
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!
      })),
      volunteerProfileNodes: volunteerProfileNodes.rows.map((row) => ({
        id: row.id,
        volunteerProfileId: row.volunteer_profile_id,
        nodeId: row.node_id,
        attachedAt: iso(row.attached_at)!,
        detachedAt: iso(row.detached_at)
      })),
      teams: teams.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? '',
        visibility: row.visibility,
        createdByVolunteerProfileId: row.created_by_volunteer_profile_id ?? undefined,
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!,
        statsUpdatedAt: iso(row.stats_updated_at)
      })),
      teamMemberships: teamMemberships.rows.map((row) => ({
        id: row.id,
        teamId: row.team_id,
        volunteerProfileId: row.volunteer_profile_id,
        role: row.role,
        status: row.status,
        joinedAt: iso(row.joined_at)!,
        leftAt: iso(row.left_at)
      })),
      badgeDefinitions: badgeDefinitions.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        criteriaKind: row.criteria_kind,
        criteriaValue: Number(row.criteria_value),
        iconName: row.icon_name ?? undefined,
        createdAt: iso(row.created_at)!
      })),
      volunteerBadges: volunteerBadges.rows.map((row) => ({
        id: row.id,
        volunteerProfileId: row.volunteer_profile_id,
        badgeSlug: row.badge_slug,
        awardedAt: iso(row.awarded_at)!,
        sourceKind: row.source_kind ?? undefined,
        sourceId: row.source_id ?? undefined
      })),
      volunteerStatsSnapshots: volunteerStatsSnapshots.rows.map((row) => ({
        id: row.id,
        volunteerProfileId: row.volunteer_profile_id,
        window: row.stats_window,
        windowStart: iso(row.window_start),
        windowEnd: iso(row.window_end),
        contributionScore: Number(row.contribution_score),
        sectionsProcessed: Number(row.sections_processed),
        packetsSubmitted: Number(row.packets_submitted),
        formatValidatedSubmissions: Number(row.format_validated_submissions),
        formatRejectedSubmissions: Number(row.format_rejected_submissions),
        consensusPassedContributions: Number(row.consensus_passed_contributions),
        consensusFailedContributions: Number(row.consensus_failed_contributions),
        humanReviewedAcceptedContributions: Number(row.human_reviewed_accepted_contributions),
        idleMinutesDonated: Number(row.idle_minutes_donated),
        distinctActiveDays: Number(row.distinct_active_days),
        currentStreakDays: Number(row.current_streak_days),
        longestStreakDays: Number(row.longest_streak_days),
        badgesCount: Number(row.badges_count),
        computedAt: iso(row.computed_at)!
      })),
      teamStatsSnapshots: teamStatsSnapshots.rows.map((row) => ({
        id: row.id,
        teamId: row.team_id,
        window: row.stats_window,
        windowStart: iso(row.window_start),
        windowEnd: iso(row.window_end),
        contributionScore: Number(row.contribution_score),
        sectionsProcessed: Number(row.sections_processed),
        packetsSubmitted: Number(row.packets_submitted),
        formatValidatedSubmissions: Number(row.format_validated_submissions),
        formatRejectedSubmissions: Number(row.format_rejected_submissions),
        consensusPassedContributions: Number(row.consensus_passed_contributions),
        consensusFailedContributions: Number(row.consensus_failed_contributions),
        humanReviewedAcceptedContributions: Number(row.human_reviewed_accepted_contributions),
        idleMinutesDonated: Number(row.idle_minutes_donated),
        distinctActiveDays: Number(row.distinct_active_days),
        currentStreakDays: Number(row.current_streak_days),
        longestStreakDays: Number(row.longest_streak_days),
        memberCount: Number(row.member_count),
        activeMemberCount: Number(row.active_member_count),
        computedAt: iso(row.computed_at)!
      })),
      workerControl: control
    });
  } finally {
    if (ownClient) c.release();
  }
}

async function saveDbToRelational(db: DatabaseState, client?: PoolClient): Promise<void> {
  const ownClient = !client;
  const c = client ?? (await getPool().connect());
  const parsed = databaseSchema.parse(db);
  try {
    if (ownClient) await c.query('BEGIN');
    await c.query('DELETE FROM extracted_facts');
    await c.query('DELETE FROM extraction_results');
    await c.query('DELETE FROM work_claims');
    await c.query('DELETE FROM work_packets');
    await c.query('DELETE FROM volunteer_profile_nodes');
    await c.query('DELETE FROM volunteer_nodes');
    await c.query('DELETE FROM projects');
    await c.query('DELETE FROM worker_control');
    await c.query('DELETE FROM ingestion_runs');
    await c.query('DELETE FROM audit_events');
    await c.query('DELETE FROM volunteer_enrollments');
    await c.query('DELETE FROM team_stats_snapshots');
    await c.query('DELETE FROM volunteer_stats_snapshots');
    await c.query('DELETE FROM volunteer_badges');
    await c.query('DELETE FROM badge_definitions');
    await c.query('DELETE FROM team_memberships');
    await c.query('DELETE FROM teams');
    await c.query('DELETE FROM volunteer_profiles');

    for (const project of parsed.projects) {
      await c.query('INSERT INTO projects(id, slug, name, description, status, created_at) VALUES($1,$2,$3,$4,$5,$6)', [project.id, project.slug, project.name, project.description, project.status, project.createdAt]);
    }
    for (const node of parsed.nodes) {
      await c.query('INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash,enrollment_code_hash,suspended_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)', [node.id, node.nodeName, node.platform, node.version, node.status, JSON.stringify(node.capabilities), node.registeredAt, node.lastHeartbeatAt, node.nodeTokenHash, node.enrollmentCodeHash, node.suspendedAt, node.revokedAt]);
    }
    for (const packet of parsed.workPackets) {
      await c.query('INSERT INTO work_packets(id,project_id,title,source_text,source_citation,source_url,source_published_at,input_hash,extractor,signature,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [packet.id, packet.projectId, packet.title, packet.sourceText, packet.sourceCitation, packet.sourceUrl, packet.sourcePublishedAt, packet.inputHash, packet.extractor, packet.signature, packet.status, packet.createdAt, packet.updatedAt]);
    }
    for (const claim of parsed.claims) {
      await c.query('INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [claim.id, claim.workPacketId, claim.nodeId, claim.status, claim.claimedAt, claim.leaseExpiresAt, claim.completedAt]);
    }
    for (const result of parsed.results) {
      await c.query('INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,validated,format_validated,consensus_status,review_status,validation_errors,warnings,summary,submitted_at,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb)', [result.id, result.workPacketId, result.nodeId, result.claimId, result.extractorVersion, result.resultHash, result.validated, result.formatValidated ?? result.validated, result.consensusStatus, result.reviewStatus, JSON.stringify(result.validationErrors), JSON.stringify(result.warnings), result.summary, result.submittedAt, result.provenance ? JSON.stringify(result.provenance) : null]);
    }
    for (const fact of parsed.facts) {
      await c.query('INSERT INTO extracted_facts(id,result_id,cancer_type,gene_or_biomarker,drug_or_compound,relationship_type,evidence_sentence,confidence,source_citation,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [fact.id, fact.resultId, fact.cancerType, fact.geneOrBiomarker, fact.drugOrCompound, fact.relationshipType, fact.evidenceSentence, fact.confidence, fact.sourceCitation, fact.sourceUrl]);
    }
    const wc = parsed.workerControl;
    await c.query('INSERT INTO worker_control(id,paused,idle_mode,min_idle_seconds,max_cpu_percent,run_now_token,updated_at) VALUES(1,$1,$2,$3,$4,$5,$6)', [wc.paused, wc.idleMode, wc.minIdleSeconds, wc.maxCpuPercent, wc.runNowToken, wc.updatedAt]);
    for (const run of parsed.ingestionRuns) {
      await c.query('INSERT INTO ingestion_runs(id,source_type,mode,status,query,retmax,started_at,completed_at,fetched_count,skipped_count,failed_count,failure_reasons,packets_created,packets_skipped,used_ncbi_email,used_ncbi_api_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)', [run.id, run.sourceType, run.mode, run.status, run.query, run.retmax, run.startedAt, run.completedAt, run.fetchedCount, run.skippedCount, run.failedCount, JSON.stringify(run.failureReasons), run.packetsCreated, run.packetsSkipped, run.usedNcbiEmail, run.usedNcbiApiKey]);
    }
    for (const enrollment of parsed.volunteerEnrollments) {
      await c.query('INSERT INTO volunteer_enrollments(id,email,enrollment_code_hash,status,created_at,used_at,node_id,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [enrollment.id, enrollment.email, enrollment.enrollmentCodeHash, enrollment.status, enrollment.createdAt, enrollment.usedAt, enrollment.nodeId, enrollment.source]);
    }
    for (const event of parsed.auditEvents) {
      await c.query('INSERT INTO audit_events(id,actor_type,actor_id,action,target_type,target_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)', [event.id, event.actorType, event.actorId, event.action, event.targetType, event.targetId, JSON.stringify(event.metadata), event.createdAt]);
    }
    for (const profile of parsed.volunteerProfiles) {
      await c.query('INSERT INTO volunteer_profiles(id,display_name,slug,privacy_mode,public_profile_enabled,avatar_color,bio,joined_at,last_active_at,stats_updated_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [profile.id, profile.displayName, profile.slug, profile.privacyMode, profile.publicProfileEnabled, profile.avatarColor, profile.bio, profile.joinedAt, profile.lastActiveAt, profile.statsUpdatedAt, profile.createdAt, profile.updatedAt]);
    }
    for (const link of parsed.volunteerProfileNodes) {
      await c.query('INSERT INTO volunteer_profile_nodes(id,volunteer_profile_id,node_id,attached_at,detached_at) VALUES($1,$2,$3,$4,$5)', [link.id, link.volunteerProfileId, link.nodeId, link.attachedAt, link.detachedAt]);
    }
    for (const team of parsed.teams) {
      await c.query('INSERT INTO teams(id,name,slug,description,visibility,created_by_volunteer_profile_id,created_at,updated_at,stats_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [team.id, team.name, team.slug, team.description, team.visibility, team.createdByVolunteerProfileId, team.createdAt, team.updatedAt, team.statsUpdatedAt]);
    }
    for (const membership of parsed.teamMemberships) {
      await c.query('INSERT INTO team_memberships(id,team_id,volunteer_profile_id,role,status,joined_at,left_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [membership.id, membership.teamId, membership.volunteerProfileId, membership.role, membership.status, membership.joinedAt, membership.leftAt]);
    }
    for (const badge of parsed.badgeDefinitions) {
      await c.query('INSERT INTO badge_definitions(id,slug,name,description,category,criteria_kind,criteria_value,icon_name,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [badge.id, badge.slug, badge.name, badge.description, badge.category, badge.criteriaKind, badge.criteriaValue, badge.iconName, badge.createdAt]);
    }
    for (const badge of parsed.volunteerBadges) {
      await c.query('INSERT INTO volunteer_badges(id,volunteer_profile_id,badge_slug,awarded_at,source_kind,source_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (volunteer_profile_id,badge_slug) DO NOTHING', [badge.id, badge.volunteerProfileId, badge.badgeSlug, badge.awardedAt, badge.sourceKind, badge.sourceId]);
    }
    for (const stats of parsed.volunteerStatsSnapshots) {
      await c.query('INSERT INTO volunteer_stats_snapshots(id,volunteer_profile_id,stats_window,window_start,window_end,contribution_score,sections_processed,packets_submitted,format_validated_submissions,format_rejected_submissions,consensus_passed_contributions,consensus_failed_contributions,human_reviewed_accepted_contributions,idle_minutes_donated,distinct_active_days,current_streak_days,longest_streak_days,badges_count,computed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)', [stats.id, stats.volunteerProfileId, stats.window, stats.windowStart, stats.windowEnd, stats.contributionScore, stats.sectionsProcessed, stats.packetsSubmitted, stats.formatValidatedSubmissions, stats.formatRejectedSubmissions, stats.consensusPassedContributions, stats.consensusFailedContributions, stats.humanReviewedAcceptedContributions, stats.idleMinutesDonated, stats.distinctActiveDays, stats.currentStreakDays, stats.longestStreakDays, stats.badgesCount, stats.computedAt]);
    }
    for (const stats of parsed.teamStatsSnapshots) {
      await c.query('INSERT INTO team_stats_snapshots(id,team_id,stats_window,window_start,window_end,contribution_score,sections_processed,packets_submitted,format_validated_submissions,format_rejected_submissions,consensus_passed_contributions,consensus_failed_contributions,human_reviewed_accepted_contributions,idle_minutes_donated,distinct_active_days,current_streak_days,longest_streak_days,member_count,active_member_count,computed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)', [stats.id, stats.teamId, stats.window, stats.windowStart, stats.windowEnd, stats.contributionScore, stats.sectionsProcessed, stats.packetsSubmitted, stats.formatValidatedSubmissions, stats.formatRejectedSubmissions, stats.consensusPassedContributions, stats.consensusFailedContributions, stats.humanReviewedAcceptedContributions, stats.idleMinutesDonated, stats.distinctActiveDays, stats.currentStreakDays, stats.longestStreakDays, stats.memberCount, stats.activeMemberCount, stats.computedAt]);
    }
    if (ownClient) await c.query('COMMIT');
  } catch (error) {
    if (ownClient) await c.query('ROLLBACK');
    throw error;
  } finally {
    if (ownClient) c.release();
  }
}

async function loadDbFromPostgres(): Promise<DatabaseState> {
  if (shouldUseRelationalPostgres()) return loadDbFromRelational();
  const client = await getPool().connect();
  try {
    await ensurePostgresSchema(client);
    const existing = await client.query<{ state: DatabaseState }>('SELECT state FROM opencause_state WHERE id = $1', [STATE_ROW_ID]);
    if (existing.rowCount && existing.rows[0]) return databaseSchema.parse(existing.rows[0].state);
    const initial = databaseSchema.parse(EMPTY_DB);
    await client.query(`INSERT INTO opencause_state (id, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO NOTHING`, [STATE_ROW_ID, JSON.stringify(initial)]);
    return initial;
  } finally {
    client.release();
  }
}

async function saveDbToPostgres(db: DatabaseState): Promise<void> {
  if (shouldUseRelationalPostgres()) return saveDbToRelational(db);
  const client = await getPool().connect();
  try {
    await ensurePostgresSchema(client);
    const parsed = databaseSchema.parse(db);
    await client.query(`INSERT INTO opencause_state (id, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`, [STATE_ROW_ID, JSON.stringify(parsed)]);
  } finally {
    client.release();
  }
}

export async function loadDb(): Promise<DatabaseState> {
  if (shouldUsePostgres()) return loadDbFromPostgres();
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    if (!parsed.workerControl) parsed.workerControl = { ...EMPTY_DB.workerControl };
    if (!parsed.ingestionRuns) parsed.ingestionRuns = [];
    if (!parsed.auditEvents) parsed.auditEvents = [];
    if (!parsed.volunteerEnrollments) parsed.volunteerEnrollments = [];
    if (!parsed.volunteerProfiles) parsed.volunteerProfiles = [];
    if (!parsed.volunteerProfileNodes) parsed.volunteerProfileNodes = [];
    if (!parsed.teams) parsed.teams = [];
    if (!parsed.teamMemberships) parsed.teamMemberships = [];
    if (!parsed.badgeDefinitions) parsed.badgeDefinitions = [];
    if (!parsed.volunteerBadges) parsed.volunteerBadges = [];
    if (!parsed.volunteerStatsSnapshots) parsed.volunteerStatsSnapshots = [];
    if (!parsed.teamStatsSnapshots) parsed.teamStatsSnapshots = [];
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
      if (shouldUseRelationalPostgres()) {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(74420620260509)');
        const state = await loadDbFromRelational(client);
        const result = await fn(state);
        await saveDbToRelational(state, client);
        await client.query('COMMIT');
        return result;
      }

      await ensurePostgresSchema(client);
      await client.query('BEGIN');
      let row = await client.query<{ state: DatabaseState }>('SELECT state FROM opencause_state WHERE id = $1 FOR UPDATE', [STATE_ROW_ID]);
      if (!row.rowCount || !row.rows[0]) {
        const initial = databaseSchema.parse(EMPTY_DB);
        await client.query(`INSERT INTO opencause_state (id, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO NOTHING`, [STATE_ROW_ID, JSON.stringify(initial)]);
        row = await client.query<{ state: DatabaseState }>('SELECT state FROM opencause_state WHERE id = $1 FOR UPDATE', [STATE_ROW_ID]);
      }
      const state = databaseSchema.parse(row.rows[0]?.state ?? EMPTY_DB);
      const result = await fn(state);
      const parsed = databaseSchema.parse(state);
      await client.query('UPDATE opencause_state SET state = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(parsed), STATE_ROW_ID]);
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

export function storageModeLabel(): 'file' | 'postgres-jsonb' | 'postgres-relational' {
  if (!shouldUsePostgres()) return 'file';
  return shouldUseRelationalPostgres() ? 'postgres-relational' : 'postgres-jsonb';
}

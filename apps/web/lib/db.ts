import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema, workPacketPayloadSchema, type DatabaseState, type WorkerControlConfig } from '@opencause/shared';
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
  extractedClaims: [],
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
  impactDigests: [],
  impactCards: [],
  projectCorpusEstimates: [],
  publicReports: [],
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

async function ensureRelationalAddonSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS project_corpus_estimates (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      corpus_source TEXT NOT NULL,
      query TEXT NOT NULL,
      eligible_document_count INTEGER NOT NULL,
      ingested_document_count INTEGER NOT NULL,
      packets_created_from_ingested_documents INTEGER NOT NULL,
      average_packets_per_document NUMERIC NOT NULL,
      estimated_total_packets INTEGER NOT NULL,
      estimate_method TEXT NOT NULL,
      refresh_status TEXT NOT NULL,
      failure_reason TEXT,
      refreshed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS project_corpus_estimates_project_source_query_idx ON project_corpus_estimates(project_id, corpus_source, query)`);
  await client.query(`CREATE INDEX IF NOT EXISTS project_corpus_estimates_project_refreshed_idx ON project_corpus_estimates(project_id, refreshed_at DESC)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS extracted_claims (
      id UUID PRIMARY KEY,
      result_id UUID NOT NULL REFERENCES extraction_results(id) ON DELETE CASCADE,
      claim_type TEXT NOT NULL,
      evidence_origin TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      study_context TEXT NOT NULL,
      polarity TEXT NOT NULL,
      direction TEXT NOT NULL,
      cancer_type TEXT,
      biomarker_mention TEXT,
      biomarker_normalized_guess TEXT,
      drug_or_intervention_mention TEXT,
      drug_normalized_guess TEXT,
      variant_mention TEXT,
      pathway_mention TEXT,
      cell_line_mention TEXT,
      species_or_model_mention TEXT,
      outcome_mention TEXT,
      outcome_measure_mention TEXT,
      statistical_evidence_mention TEXT,
      sample_size_mention TEXT,
      pmid TEXT,
      pmcid TEXT,
      section_title TEXT,
      section_type TEXT,
      paragraph_index INTEGER,
      sentence_index INTEGER,
      char_start INTEGER,
      char_end INTEGER,
      exact_evidence_sentence TEXT NOT NULL,
      evidence_context TEXT,
      review_priority TEXT,
      confidence NUMERIC NOT NULL,
      source_citation TEXT NOT NULL,
      source_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE work_packets ADD COLUMN IF NOT EXISTS signed_payload JSONB`);
  await client.query(`CREATE INDEX IF NOT EXISTS extracted_claims_result_idx ON extracted_claims(result_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS extracted_claims_origin_type_idx ON extracted_claims(evidence_origin, evidence_type)`);
}

async function loadDbFromRelational(client?: PoolClient): Promise<DatabaseState> {
  const ownClient = !client;
  const c = client ?? (await getPool().connect());
  try {
    await ensureRelationalAddonSchema(c);
    const [projects, packets, nodes, claims, results, extractedClaims, workerControl, ingestionRuns, auditEvents, volunteerEnrollments, volunteerProfiles, volunteerProfileNodes, teams, teamMemberships, badgeDefinitions, volunteerBadges, volunteerStatsSnapshots, teamStatsSnapshots, impactDigests, impactCards, projectCorpusEstimates, publicReports] = await Promise.all([
      c.query('SELECT * FROM projects ORDER BY created_at'),
      c.query('SELECT * FROM work_packets ORDER BY created_at'),
      c.query('SELECT * FROM volunteer_nodes ORDER BY registered_at'),
      c.query('SELECT * FROM work_claims ORDER BY claimed_at'),
      c.query('SELECT * FROM extraction_results ORDER BY submitted_at'),
      c.query('SELECT * FROM extracted_claims ORDER BY id'),
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
      c.query('SELECT * FROM team_stats_snapshots ORDER BY computed_at DESC'),
      c.query('SELECT * FROM impact_digests ORDER BY period_start DESC'),
      c.query('SELECT * FROM impact_cards ORDER BY created_at DESC'),
      c.query('SELECT * FROM project_corpus_estimates ORDER BY refreshed_at DESC'),
      c.query('SELECT * FROM public_reports ORDER BY created_at DESC')
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
        setupTokenHash: row.setup_token_hash ?? undefined,
        setupTokenExpiresAt: iso(row.setup_token_expires_at),
        moderationStatus: row.moderation_status ?? 'ok',
        moderationNote: row.moderation_note ?? undefined,
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
        statsUpdatedAt: iso(row.stats_updated_at),
        moderationStatus: row.moderation_status ?? 'ok',
        moderationNote: row.moderation_note ?? undefined
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
      impactDigests: impactDigests.rows.map((row) => ({
        id: row.id,
        volunteerProfileId: row.volunteer_profile_id,
        periodStart: iso(row.period_start)!,
        periodEnd: iso(row.period_end)!,
        sectionsProcessed: Number(row.sections_processed),
        formatValidatedSubmissions: Number(row.format_validated_submissions),
        consensusPassedContributions: Number(row.consensus_passed_contributions),
        idleMinutesDonated: Number(row.idle_minutes_donated),
        badgesAwarded: Number(row.badges_awarded),
        teamRank: row.team_rank === null || row.team_rank === undefined ? null : Number(row.team_rank),
        previewText: row.preview_text,
        createdAt: iso(row.created_at)!,
        deliveredAt: iso(row.delivered_at)
      })),
      impactCards: impactCards.rows.map((row) => ({
        id: row.id,
        volunteerProfileId: row.volunteer_profile_id ?? null,
        teamId: row.team_id ?? null,
        cardType: row.card_type,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle,
        metricLabel: row.metric_label,
        metricValue: row.metric_value,
        accentColor: row.accent_color,
        publicEnabled: row.public_enabled,
        moderationStatus: row.moderation_status ?? 'ok',
        moderationNote: row.moderation_note ?? undefined,
        periodStart: iso(row.period_start),
        periodEnd: iso(row.period_end),
        createdAt: iso(row.created_at)!
      })),
      projectCorpusEstimates: projectCorpusEstimates.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        corpusSource: row.corpus_source,
        query: row.query,
        eligibleDocumentCount: Number(row.eligible_document_count),
        ingestedDocumentCount: Number(row.ingested_document_count),
        packetsCreatedFromIngestedDocuments: Number(row.packets_created_from_ingested_documents),
        averagePacketsPerDocument: Number(row.average_packets_per_document),
        estimatedTotalPackets: Number(row.estimated_total_packets),
        estimateMethod: row.estimate_method,
        refreshStatus: row.refresh_status,
        failureReason: row.failure_reason,
        refreshedAt: iso(row.refreshed_at)!,
        createdAt: iso(row.created_at)!,
        updatedAt: iso(row.updated_at)!
      })),
      publicReports: publicReports.rows.map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id ?? null,
        targetSlug: row.target_slug ?? null,
        reason: row.reason,
        details: row.details ?? '',
        reporterContact: row.reporter_contact ?? null,
        status: row.status,
        createdAt: iso(row.created_at)!,
        reviewedAt: iso(row.reviewed_at)
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
    await c.query('DELETE FROM extracted_claims');
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
    await c.query('DELETE FROM public_reports');
    await c.query('DELETE FROM project_corpus_estimates');
    await c.query('DELETE FROM impact_cards');
    await c.query('DELETE FROM impact_digests');
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
      const signedPayload = workPacketPayloadSchema.parse(packet);
      await c.query('INSERT INTO work_packets(id,project_id,title,source_text,source_citation,source_url,source_published_at,input_hash,extractor,signature,signed_payload,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)', [packet.id, packet.projectId, packet.title, packet.sourceText, packet.sourceCitation, packet.sourceUrl, packet.sourcePublishedAt, packet.inputHash, packet.extractor, packet.signature, JSON.stringify(signedPayload), packet.status, packet.createdAt, packet.updatedAt]);
    }
    for (const claim of parsed.claims) {
      await c.query('INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [claim.id, claim.workPacketId, claim.nodeId, claim.status, claim.claimedAt, claim.leaseExpiresAt, claim.completedAt]);
    }
    for (const result of parsed.results) {
      await c.query('INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,validated,format_validated,consensus_status,review_status,validation_errors,warnings,summary,submitted_at,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb)', [result.id, result.workPacketId, result.nodeId, result.claimId, result.extractorVersion, result.resultHash, result.validated, result.formatValidated ?? result.validated, result.consensusStatus, result.reviewStatus, JSON.stringify(result.validationErrors), JSON.stringify(result.warnings), result.summary, result.submittedAt, result.provenance ? JSON.stringify(result.provenance) : null]);
    }
    for (const claim of parsed.extractedClaims ?? []) {
      await c.query('INSERT INTO extracted_claims(id,result_id,claim_type,evidence_origin,evidence_type,study_context,polarity,direction,cancer_type,biomarker_mention,biomarker_normalized_guess,drug_or_intervention_mention,drug_normalized_guess,variant_mention,pathway_mention,cell_line_mention,species_or_model_mention,outcome_mention,outcome_measure_mention,statistical_evidence_mention,sample_size_mention,pmid,pmcid,section_title,section_type,paragraph_index,sentence_index,char_start,char_end,exact_evidence_sentence,evidence_context,review_priority,confidence,source_citation,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)', [claim.id, claim.resultId, claim.claimType, claim.evidenceOrigin, claim.evidenceType, claim.studyContext, claim.polarity, claim.direction, claim.cancerType, claim.biomarkerMention, claim.biomarkerNormalizedGuess, claim.drugOrInterventionMention, claim.drugNormalizedGuess, claim.variantMention, claim.pathwayMention, claim.cellLineMention, claim.speciesOrModelMention, claim.outcomeMention, claim.outcomeMeasureMention, claim.statisticalEvidenceMention, claim.sampleSizeMention, claim.pmid, claim.pmcid, claim.sectionTitle, claim.sectionType, claim.paragraphIndex, claim.sentenceIndex, claim.charStart, claim.charEnd, claim.exactEvidenceSentence, claim.evidenceContext, claim.reviewPriority, claim.confidence, claim.sourceCitation, claim.sourceUrl]);
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
      await c.query('INSERT INTO volunteer_profiles(id,display_name,slug,privacy_mode,public_profile_enabled,avatar_color,bio,setup_token_hash,setup_token_expires_at,moderation_status,moderation_note,joined_at,last_active_at,stats_updated_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)', [profile.id, profile.displayName, profile.slug, profile.privacyMode, profile.publicProfileEnabled, profile.avatarColor, profile.bio, profile.setupTokenHash, profile.setupTokenExpiresAt, profile.moderationStatus ?? 'ok', profile.moderationNote, profile.joinedAt, profile.lastActiveAt, profile.statsUpdatedAt, profile.createdAt, profile.updatedAt]);
    }
    for (const link of parsed.volunteerProfileNodes) {
      await c.query('INSERT INTO volunteer_profile_nodes(id,volunteer_profile_id,node_id,attached_at,detached_at) VALUES($1,$2,$3,$4,$5)', [link.id, link.volunteerProfileId, link.nodeId, link.attachedAt, link.detachedAt]);
    }
    for (const team of parsed.teams) {
      await c.query('INSERT INTO teams(id,name,slug,description,visibility,created_by_volunteer_profile_id,created_at,updated_at,stats_updated_at,moderation_status,moderation_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [team.id, team.name, team.slug, team.description, team.visibility, team.createdByVolunteerProfileId, team.createdAt, team.updatedAt, team.statsUpdatedAt, team.moderationStatus ?? 'ok', team.moderationNote]);
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
    for (const digest of parsed.impactDigests) {
      await c.query('INSERT INTO impact_digests(id,volunteer_profile_id,period_start,period_end,sections_processed,format_validated_submissions,consensus_passed_contributions,idle_minutes_donated,badges_awarded,team_rank,preview_text,created_at,delivered_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (volunteer_profile_id,period_start,period_end) DO UPDATE SET sections_processed=EXCLUDED.sections_processed, format_validated_submissions=EXCLUDED.format_validated_submissions, consensus_passed_contributions=EXCLUDED.consensus_passed_contributions, idle_minutes_donated=EXCLUDED.idle_minutes_donated, badges_awarded=EXCLUDED.badges_awarded, team_rank=EXCLUDED.team_rank, preview_text=EXCLUDED.preview_text, created_at=EXCLUDED.created_at, delivered_at=EXCLUDED.delivered_at', [digest.id, digest.volunteerProfileId, digest.periodStart, digest.periodEnd, digest.sectionsProcessed, digest.formatValidatedSubmissions, digest.consensusPassedContributions, digest.idleMinutesDonated, digest.badgesAwarded, digest.teamRank, digest.previewText, digest.createdAt, digest.deliveredAt]);
    }
    for (const card of parsed.impactCards) {
      await c.query('INSERT INTO impact_cards(id,volunteer_profile_id,team_id,card_type,slug,title,subtitle,metric_label,metric_value,accent_color,public_enabled,moderation_status,moderation_note,period_start,period_end,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, subtitle=EXCLUDED.subtitle, metric_label=EXCLUDED.metric_label, metric_value=EXCLUDED.metric_value, accent_color=EXCLUDED.accent_color, public_enabled=EXCLUDED.public_enabled, moderation_status=EXCLUDED.moderation_status, moderation_note=EXCLUDED.moderation_note, period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end, created_at=EXCLUDED.created_at', [card.id, card.volunteerProfileId, card.teamId, card.cardType, card.slug, card.title, card.subtitle, card.metricLabel, card.metricValue, card.accentColor, card.publicEnabled, card.moderationStatus ?? 'ok', card.moderationNote, card.periodStart, card.periodEnd, card.createdAt]);
    }
    for (const estimate of parsed.projectCorpusEstimates ?? []) {
      await c.query('INSERT INTO project_corpus_estimates(id,project_id,corpus_source,query,eligible_document_count,ingested_document_count,packets_created_from_ingested_documents,average_packets_per_document,estimated_total_packets,estimate_method,refresh_status,failure_reason,refreshed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (project_id,corpus_source,query) DO UPDATE SET eligible_document_count=EXCLUDED.eligible_document_count, ingested_document_count=EXCLUDED.ingested_document_count, packets_created_from_ingested_documents=EXCLUDED.packets_created_from_ingested_documents, average_packets_per_document=EXCLUDED.average_packets_per_document, estimated_total_packets=EXCLUDED.estimated_total_packets, estimate_method=EXCLUDED.estimate_method, refresh_status=EXCLUDED.refresh_status, failure_reason=EXCLUDED.failure_reason, refreshed_at=EXCLUDED.refreshed_at, updated_at=EXCLUDED.updated_at', [estimate.id, estimate.projectId, estimate.corpusSource, estimate.query, estimate.eligibleDocumentCount, estimate.ingestedDocumentCount, estimate.packetsCreatedFromIngestedDocuments, estimate.averagePacketsPerDocument, estimate.estimatedTotalPackets, estimate.estimateMethod, estimate.refreshStatus, estimate.failureReason, estimate.refreshedAt, estimate.createdAt, estimate.updatedAt]);
    }
    for (const report of parsed.publicReports) {
      await c.query('INSERT INTO public_reports(id,target_type,target_id,target_slug,reason,details,reporter_contact,status,created_at,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [report.id, report.targetType, report.targetId, report.targetSlug, report.reason, report.details, report.reporterContact, report.status, report.createdAt, report.reviewedAt]);
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
    if (!parsed.extractedClaims) parsed.extractedClaims = [];
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
    if (!parsed.impactDigests) parsed.impactDigests = [];
    if (!parsed.impactCards) parsed.impactCards = [];
    if (!parsed.projectCorpusEstimates) parsed.projectCorpusEstimates = [];
    if (!parsed.publicReports) parsed.publicReports = [];
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

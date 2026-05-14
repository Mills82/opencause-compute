import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  hashJson,
  validateResultForPacket,
  workPacketPayloadSchema,
  type ExtractedClaimRecord,
  type ExtractedFactRecord,
  type ExtractionResult,
  type ResultPayload,
  type ResultProvenance,
  type WorkPacket,
  type WorkPacketPayload
} from '@opencause/shared';
import { REQUIRED_CONSENSUS_SUBMISSIONS, REQUIRED_CONSENSUS_WEIGHT } from './consensus-scoring';
import { hashNodeToken } from './node-auth';
import { verifyWorkPacketSignature } from './signing';
import { packetSigningDiagnostics } from './signing-diagnostics';

const DATABASE_URL = process.env.DATABASE_URL;
const LEASE_MINUTES = 10;
const NODE_STALE_MINUTES = 3;
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


function modelFromCapabilities(capabilities: unknown): string | null {
  if (!Array.isArray(capabilities)) return null;
  const found = capabilities.find((capability) => typeof capability === 'string' && capability.startsWith('model:'));
  return typeof found === 'string' ? found.slice('model:'.length) : null;
}

function sqlResultModel(): string {
  return `coalesce(r.provenance->>'modelName', r.provenance->>'model', 'unknown')`;
}

function sqlModelConsensusWeight(): string {
  return `CASE coalesce(r.provenance->>'modelName', r.provenance->>'model', '')
          WHEN 'qwen3:14b' THEN 1.25
          WHEN 'gpt-oss:20b' THEN 1.20
          WHEN 'gemma4:26b' THEN 1.18
          WHEN 'gemma4:31b' THEN 1.18
          WHEN 'gemma3:12b' THEN 1.05
          WHEN 'gemma4:e4b' THEN 0.75
          ELSE CASE COALESCE(r.provenance->>'generationQualityTier', 'balanced')
            WHEN 'ultra' THEN 1.20
            WHEN 'high' THEN 1.10
            WHEN 'balanced' THEN 1.00
            WHEN 'low' THEN 0.80
            WHEN 'mock' THEN 0.50
            ELSE 1.0
          END
        END`;
}

function packetPayloadFromRow(row: any): WorkPacketPayload {
  if (row.signed_payload && typeof row.signed_payload === 'object') {
    return workPacketPayloadSchema.parse(row.signed_payload);
  }
  return workPacketPayloadSchema.parse({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    sourceText: row.source_text,
    sourceCitation: row.source_citation,
    sourceUrl: row.source_url,
    sourcePublishedAt: row.source_published_at ?? undefined,
    inputHash: row.input_hash,
    extractor: row.extractor,
    createdAt: iso(row.created_at)!
  });
}

function packetFromRow(row: any): WorkPacket {
  return {
    ...packetPayloadFromRow(row),
    signature: row.signature,
    status: row.status,
    updatedAt: iso(row.updated_at)!
  };
}

function sqlConsensusFactKey(): string {
  return `lower(trim('facts-v1|' || coalesce(relationship_type,'') || '|' || coalesce(cancer_type,'') || '|' || coalesce(gene_or_biomarker,'') || '|' || coalesce(drug_or_compound,'')))`;
}

function sqlConsensusClaimKey(): string {
  return `lower(trim('claims-v2|' || coalesce(claim_type,'') || '|' || coalesce(cancer_type,'') || '|' || coalesce(biomarker_mention,'') || '|' || coalesce(drug_or_intervention_mention,'') || '|' || coalesce(outcome_mention,'') || '|' || coalesce(exact_evidence_sentence,'') || '|' || coalesce(evidence_origin,'') || '|' || coalesce(polarity,'') || '|' || coalesce(direction,'')))`;
}

async function updateConsensusForPacket(client: PoolClient, packetId: string): Promise<'consensus_pending' | 'consensus_passed' | 'consensus_failed'> {
  const count = await client.query('SELECT COUNT(DISTINCT node_id)::int AS count FROM extraction_results WHERE work_packet_id = $1 AND format_validated = true', [packetId]);
  if (Number(count.rows[0]?.count ?? 0) < REQUIRED_CONSENSUS_SUBMISSIONS) {
    await client.query("UPDATE extraction_results SET consensus_status = 'consensus_pending' WHERE work_packet_id = $1", [packetId]);
    return 'consensus_pending';
  }

  const agreement = await client.query(
    `SELECT COUNT(*)::int AS count FROM (
      SELECT ${sqlConsensusFactKey()} AS fact_key,
        COUNT(DISTINCT r.node_id)::int AS node_count,
        SUM(${sqlModelConsensusWeight()} )::float AS agreement_weight
      FROM (
        SELECT result_id, ${sqlConsensusFactKey()} AS fact_key FROM extracted_facts
        UNION ALL
        SELECT result_id, ${sqlConsensusClaimKey()} AS fact_key FROM extracted_claims WHERE evidence_origin <> 'methods_only'
      ) f
      JOIN extraction_results r ON r.id = f.result_id
      WHERE r.work_packet_id = $1 AND r.format_validated = true
      GROUP BY fact_key
      HAVING COUNT(DISTINCT r.node_id) >= $2 AND SUM(${sqlModelConsensusWeight()} ) >= $3
    ) agreed`,
    [packetId, REQUIRED_CONSENSUS_SUBMISSIONS, REQUIRED_CONSENSUS_WEIGHT]
  );
  const status = Number(agreement.rows[0]?.count ?? 0) > 0 ? 'consensus_passed' : 'consensus_failed';
  await client.query('UPDATE extraction_results SET consensus_status = $2, review_status = CASE WHEN $2 = \'consensus_failed\' THEN \'needs_human_review\' ELSE review_status END WHERE work_packet_id = $1', [packetId, status]);
  return status;
}

async function recordAuditEvent(client: PoolClient, input: {
  actorType: 'admin' | 'cron' | 'node' | 'system';
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await client.query(
    'INSERT INTO audit_events(id,actor_type,actor_id,action,target_type,target_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())',
    [randomUUID(), input.actorType, input.actorId, input.action, input.targetType, input.targetId, JSON.stringify(input.metadata ?? {})]
  );
}

async function assertNodeAuthorized(client: PoolClient, nodeId: string, token: string | null) {
  if (!token) throw new Error('node_unauthorized');
  const nodeResult = await client.query('SELECT * FROM volunteer_nodes WHERE id = $1 FOR UPDATE', [nodeId]);
  const node = nodeResult.rows[0];
  if (!node?.node_token_hash || hashNodeToken(token) !== node.node_token_hash) throw new Error('node_unauthorized');
  if (node.status === 'revoked' || node.status === 'suspended') throw new Error(`node_${node.status}`);

  const staleCutoff = Date.now() - NODE_STALE_MINUTES * 60_000;
  const heartbeatMs = node.last_heartbeat_at ? new Date(node.last_heartbeat_at).getTime() : 0;
  if (heartbeatMs < staleCutoff) {
    await client.query("UPDATE volunteer_nodes SET status = 'offline' WHERE id = $1", [nodeId]);
    throw new Error('node_offline');
  }
  return node;
}

export async function claimWorkRelational(nodeId: string, token: string | null): Promise<{ claimId: string; packet: WorkPacketPayload; signature: string } | null | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const node = await assertNodeAuthorized(client, nodeId, token);
    const nodeModel = modelFromCapabilities(node.capabilities);

    await client.query("UPDATE work_claims SET status = 'expired', completed_at = NOW() WHERE status = 'claimed' AND lease_expires_at <= NOW()");
    await client.query("UPDATE work_packets SET status = 'queued', updated_at = NOW() WHERE status = 'claimed' AND NOT EXISTS (SELECT 1 FROM work_claims c WHERE c.work_packet_id = work_packets.id AND c.status = 'claimed')");

    const active = await client.query(
      `SELECT c.id AS claim_id, p.*
       FROM work_claims c
       JOIN work_packets p ON p.id = c.work_packet_id
       WHERE c.node_id = $1 AND c.status = 'claimed' AND p.status = 'claimed'
       ORDER BY c.claimed_at
       LIMIT 1
       FOR UPDATE OF c, p`,
      [nodeId]
    );
    if (active.rows[0]) {
      const extended = await client.query('UPDATE work_claims SET lease_expires_at = NOW() + ($2 || \' minutes\')::interval WHERE id = $1 AND status = \'claimed\' RETURNING id', [active.rows[0].claim_id, LEASE_MINUTES]);
      if (extended.rowCount !== 1) {
        await client.query('COMMIT');
        return null;
      }
      await recordAuditEvent(client, { actorType: 'node', actorId: nodeId, action: 'work.claim.reused', targetType: 'work_packet', targetId: active.rows[0].id, metadata: { claimId: active.rows[0].claim_id } });
      await client.query('COMMIT');
      return { claimId: active.rows[0].claim_id, packet: packetPayloadFromRow(active.rows[0]), signature: active.rows[0].signature };
    }

    const packetResult = await client.query(
      `SELECT * FROM work_packets
       WHERE status = 'queued'
       AND extractor = ANY($2::text[])
       AND (
         COALESCE(($3::jsonb->>'qualityTier'), 'balanced') NOT IN ('budget') OR char_length(source_text) <= 6000
       )
       AND (
         COALESCE(($3::jsonb->>'qualityTier'), 'balanced') NOT IN ('balanced') OR char_length(source_text) <= 10000
       )
       AND NOT EXISTS (
         SELECT 1 FROM work_claims prior
         WHERE prior.work_packet_id = work_packets.id
         AND prior.node_id = $1
         AND prior.status IN ('completed', 'failed')
       )
       ORDER BY
         CASE
           WHEN $4::text IS NULL THEN 0
           WHEN EXISTS (
             SELECT 1 FROM extraction_results r
             WHERE r.work_packet_id = work_packets.id
             AND coalesce(r.provenance->>'modelName', r.provenance->>'model', '') = $4::text
           ) THEN 1
           ELSE 0
         END,
         CASE WHEN EXISTS (SELECT 1 FROM extraction_results r WHERE r.work_packet_id = work_packets.id) THEN 0 ELSE 1 END,
         updated_at,
         created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [nodeId, node.capabilities ?? [], node.hostSnapshot ?? {}, nodeModel]
    );
    const packet = packetResult.rows[0];
    if (!packet) {
      await client.query('COMMIT');
      return null;
    }
    const packetPayload = packetPayloadFromRow(packet);
    if (!verifyWorkPacketSignature(packetPayload, packet.signature)) {
      const signing = packetSigningDiagnostics();
      await client.query("UPDATE work_packets SET status = 'invalid_signature', updated_at = NOW() WHERE id = $1", [packet.id]);
      await recordAuditEvent(client, { actorType: 'system', action: 'work.packet.invalid_signature_quarantined', targetType: 'work_packet', targetId: packet.id, metadata: { reason: 'claim_preflight_signature_verification_failed', signing: { mode: signing.signingMode, keyId: signing.keyId, publicKeyFingerprint: signing.publicKeyFingerprint, derivedPublicKeyFingerprint: signing.derivedPublicKeyFingerprint, keyPairVerifyOk: signing.keyPairVerifyOk } } });
      await client.query('COMMIT');
      return claimWorkRelational(nodeId, token);
    }

    const claimId = randomUUID();
    await client.query(
      `INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at)
       VALUES($1,$2,$3,'claimed',NOW(),NOW() + ($4 || ' minutes')::interval,NULL)`,
      [claimId, packet.id, nodeId, LEASE_MINUTES]
    );
    await client.query("UPDATE work_packets SET status = 'claimed', updated_at = NOW() WHERE id = $1", [packet.id]);
    await recordAuditEvent(client, { actorType: 'node', actorId: nodeId, action: 'work.claim.created', targetType: 'work_packet', targetId: packet.id, metadata: { claimId } });
    await client.query('COMMIT');
    return { claimId, packet: packetPayload, signature: packet.signature };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function failClaimRelational(input: {
  nodeId: string;
  token: string | null;
  claimId: string;
  workPacketId: string;
  reason: string;
}): Promise<{ ok: true } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await assertNodeAuthorized(client, input.nodeId, input.token);
    const claimRow = (await client.query('SELECT * FROM work_claims WHERE id = $1 FOR UPDATE', [input.claimId])).rows[0];
    if (!claimRow) throw new Error('claim_not_found');
    if (claimRow.node_id !== input.nodeId || claimRow.work_packet_id !== input.workPacketId) throw new Error('claim_mismatch');
    if (claimRow.status === 'completed') {
      await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.claim.fail_ignored_completed', targetType: 'work_packet', targetId: input.workPacketId, metadata: { claimId: input.claimId, reason: input.reason } });
      await client.query('COMMIT');
      return { ok: true };
    }
    if (claimRow.status !== 'claimed') throw new Error(`claim_${claimRow.status}`);
    await client.query("UPDATE work_claims SET status = 'failed', completed_at = NOW() WHERE id = $1", [input.claimId]);
    await client.query("UPDATE work_packets SET status = 'queued', updated_at = NOW() WHERE id = $1", [input.workPacketId]);
    await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.claim.failed', targetType: 'work_packet', targetId: input.workPacketId, metadata: { claimId: input.claimId, reason: input.reason } });
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


export async function releaseClaimRelational(input: {
  nodeId: string;
  token: string | null;
  claimId: string;
  workPacketId: string;
  reason: string;
}): Promise<{ ok: true } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await assertNodeAuthorized(client, input.nodeId, input.token);
    const claimRow = (await client.query('SELECT * FROM work_claims WHERE id = $1 FOR UPDATE', [input.claimId])).rows[0];
    if (!claimRow) throw new Error('claim_not_found');
    if (claimRow.node_id !== input.nodeId || claimRow.work_packet_id !== input.workPacketId) throw new Error('claim_mismatch');
    if (claimRow.status === 'completed') {
      await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.claim.release_ignored_completed', targetType: 'work_packet', targetId: input.workPacketId, metadata: { claimId: input.claimId, reason: input.reason } });
      await client.query('COMMIT');
      return { ok: true };
    }
    if (claimRow.status !== 'claimed') throw new Error(`claim_${claimRow.status}`);
    await client.query("UPDATE work_claims SET status = 'released', completed_at = NOW() WHERE id = $1", [input.claimId]);
    await client.query("UPDATE work_packets SET status = 'queued', updated_at = NOW() WHERE id = $1", [input.workPacketId]);
    await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.claim.released', targetType: 'work_packet', targetId: input.workPacketId, metadata: { claimId: input.claimId, reason: input.reason } });
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function submitResultRelational(input: {
  nodeId: string;
  token: string | null;
  claimId: string;
  workPacketId: string;
  extractorVersion: 'Local LLM v1' | 'Local LLM v2' | 'Mock Extractor v1';
  result: ResultPayload;
  provenance?: ResultProvenance;
}): Promise<{ record: ExtractionResult; facts: ExtractedFactRecord[]; claims: ExtractedClaimRecord[]; workPacket: WorkPacket } | undefined> {
  if (!enabled()) return undefined;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const node = await assertNodeAuthorized(client, input.nodeId, input.token);
    const claimRow = (await client.query('SELECT * FROM work_claims WHERE id = $1 FOR UPDATE', [input.claimId])).rows[0];
    if (!claimRow) throw new Error('claim_not_found');
    if (claimRow.node_id !== input.nodeId || claimRow.work_packet_id !== input.workPacketId) throw new Error('claim_mismatch');
    if (claimRow.status !== 'claimed') throw new Error(`claim_${claimRow.status}`);
    if (new Date(claimRow.lease_expires_at).getTime() <= Date.now()) throw new Error('claim_expired');

    const packetRow = (await client.query('SELECT * FROM work_packets WHERE id = $1 FOR UPDATE', [input.workPacketId])).rows[0];
    if (!packetRow) throw new Error('work_packet_not_found');
    const packet = packetFromRow(packetRow);
    const validation = validateResultForPacket(input.result, packet);
    const submittedAt = new Date().toISOString();
    const resultHash = hashJson(input.result);
    const resultId = randomUUID();
    const record: ExtractionResult = {
      id: resultId,
      workPacketId: packet.id,
      nodeId: input.nodeId,
      claimId: input.claimId,
      extractorVersion: input.extractorVersion,
      resultHash,
      validated: validation.valid,
      formatValidated: validation.valid,
      consensusStatus: 'consensus_pending',
      reviewStatus: validation.valid ? 'not_reviewed' : 'needs_human_review',
      validationErrors: validation.errors,
      warnings: input.result.warnings,
      summary: input.result.summary,
      submittedAt,
      provenance: input.provenance ?? {
        workerVersion: node.version,
        extractorVersion: input.extractorVersion,
        promptVersion: 'unknown',
        promptHash: 'unknown',
        packetSchemaVersion: 'work-packet-v1',
        extractionTimestamp: submittedAt,
        workerPlatform: node.platform,
        workerCapabilities: node.capabilities ?? [],
        resultValidationVersion: 'format-validation-v1'
      }
    };

    await client.query(
      'INSERT INTO extraction_results(id,work_packet_id,node_id,claim_id,extractor_version,result_hash,validated,format_validated,consensus_status,review_status,validation_errors,warnings,summary,submitted_at,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb)',
      [record.id, record.workPacketId, record.nodeId, record.claimId, record.extractorVersion, record.resultHash, record.validated, record.formatValidated, record.consensusStatus, record.reviewStatus, JSON.stringify(record.validationErrors), JSON.stringify(record.warnings), record.summary, record.submittedAt, JSON.stringify(record.provenance)]
    );

    const facts: ExtractedFactRecord[] = 'facts' in input.result ? input.result.facts.map((fact) => ({ id: randomUUID(), resultId, ...fact, sourceCitation: packet.sourceCitation, sourceUrl: packet.sourceUrl })) : [];
    for (const fact of facts) {
      await client.query('INSERT INTO extracted_facts(id,result_id,cancer_type,gene_or_biomarker,drug_or_compound,relationship_type,evidence_sentence,confidence,source_citation,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [fact.id, fact.resultId, fact.cancerType, fact.geneOrBiomarker, fact.drugOrCompound, fact.relationshipType, fact.evidenceSentence, fact.confidence, fact.sourceCitation, fact.sourceUrl]);
    }
    const claims: ExtractedClaimRecord[] = 'claims' in input.result ? input.result.claims.map((claim) => ({ id: randomUUID(), resultId, ...claim, sourceCitation: packet.sourceCitation, sourceUrl: packet.sourceUrl })) : [];
    for (const claim of claims) {
      await client.query('INSERT INTO extracted_claims(id,result_id,claim_type,evidence_origin,evidence_type,study_context,polarity,direction,cancer_type,biomarker_mention,biomarker_normalized_guess,drug_or_intervention_mention,drug_normalized_guess,variant_mention,pathway_mention,cell_line_mention,species_or_model_mention,outcome_mention,outcome_measure_mention,statistical_evidence_mention,sample_size_mention,pmid,pmcid,section_title,section_type,paragraph_index,sentence_index,char_start,char_end,exact_evidence_sentence,evidence_context,review_priority,confidence,source_citation,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)', [claim.id, claim.resultId, claim.claimType, claim.evidenceOrigin, claim.evidenceType, claim.studyContext, claim.polarity, claim.direction, claim.cancerType, claim.biomarkerMention, claim.biomarkerNormalizedGuess, claim.drugOrInterventionMention, claim.drugNormalizedGuess, claim.variantMention, claim.pathwayMention, claim.cellLineMention, claim.speciesOrModelMention, claim.outcomeMention, claim.outcomeMeasureMention, claim.statisticalEvidenceMention, claim.sampleSizeMention, claim.pmid, claim.pmcid, claim.sectionTitle, claim.sectionType, claim.paragraphIndex, claim.sentenceIndex, claim.charStart, claim.charEnd, claim.exactEvidenceSentence, claim.evidenceContext, claim.reviewPriority, claim.confidence, claim.sourceCitation, claim.sourceUrl]);
    }
    await client.query("UPDATE work_claims SET status = 'completed', completed_at = $2 WHERE id = $1", [input.claimId, submittedAt]);
    const consensusStatus = await updateConsensusForPacket(client, packet.id);
    const packetStatus = consensusStatus === 'consensus_passed' || consensusStatus === 'consensus_failed' ? 'completed' : 'queued';
    await client.query('UPDATE work_packets SET status = $2, updated_at = $3 WHERE id = $1', [packet.id, packetStatus, submittedAt]);
    packet.status = packetStatus;
    packet.updatedAt = submittedAt;
    await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.submit.completed', targetType: 'work_packet', targetId: packet.id, metadata: { claimId: input.claimId, resultId, formatValidated: record.formatValidated, validationErrors: record.validationErrors.length } });
    await client.query('COMMIT');
    return { record, facts, claims, workPacket: packet };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

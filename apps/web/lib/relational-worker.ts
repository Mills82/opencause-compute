import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  hashJson,
  validateResultForPacket,
  workPacketPayloadSchema,
  type ExtractedFactRecord,
  type ExtractionResult,
  type ResultPayload,
  type ResultProvenance,
  type WorkPacket,
  type WorkPacketPayload
} from '@opencause/shared';
import { hashNodeToken } from './node-auth';

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

function packetPayloadFromRow(row: any): WorkPacketPayload {
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
    await assertNodeAuthorized(client, nodeId, token);

    await client.query("UPDATE work_claims SET status = 'expired', completed_at = NOW() WHERE status = 'claimed' AND lease_expires_at <= NOW()");
    await client.query("UPDATE work_packets SET status = 'queued', updated_at = NOW() WHERE status = 'claimed' AND NOT EXISTS (SELECT 1 FROM work_claims c WHERE c.work_packet_id = work_packets.id AND c.status = 'claimed')");

    const active = await client.query(
      `SELECT c.id AS claim_id, p.*
       FROM work_claims c
       JOIN work_packets p ON p.id = c.work_packet_id
       WHERE c.node_id = $1 AND c.status = 'claimed'
       ORDER BY c.claimed_at
       LIMIT 1`,
      [nodeId]
    );
    if (active.rows[0]) {
      await client.query('UPDATE work_claims SET lease_expires_at = NOW() + ($2 || \' minutes\')::interval WHERE id = $1', [active.rows[0].claim_id, LEASE_MINUTES]);
      await recordAuditEvent(client, { actorType: 'node', actorId: nodeId, action: 'work.claim.reused', targetType: 'work_packet', targetId: active.rows[0].id, metadata: { claimId: active.rows[0].claim_id } });
      await client.query('COMMIT');
      return { claimId: active.rows[0].claim_id, packet: packetPayloadFromRow(active.rows[0]), signature: active.rows[0].signature };
    }

    const packetResult = await client.query(
      `SELECT * FROM work_packets
       WHERE status = 'queued'
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    const packet = packetResult.rows[0];
    if (!packet) {
      await client.query('COMMIT');
      return null;
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
    return { claimId, packet: packetPayloadFromRow(packet), signature: packet.signature };
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
  extractorVersion: 'Local LLM v1' | 'Mock Extractor v1';
  result: ResultPayload;
  provenance?: ResultProvenance;
}): Promise<{ record: ExtractionResult; facts: ExtractedFactRecord[]; workPacket: WorkPacket } | undefined> {
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

    const facts: ExtractedFactRecord[] = input.result.facts.map((fact) => ({ id: randomUUID(), resultId, ...fact, sourceCitation: packet.sourceCitation, sourceUrl: packet.sourceUrl }));
    for (const fact of facts) {
      await client.query('INSERT INTO extracted_facts(id,result_id,cancer_type,gene_or_biomarker,drug_or_compound,relationship_type,evidence_sentence,confidence,source_citation,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [fact.id, fact.resultId, fact.cancerType, fact.geneOrBiomarker, fact.drugOrCompound, fact.relationshipType, fact.evidenceSentence, fact.confidence, fact.sourceCitation, fact.sourceUrl]);
    }
    await client.query("UPDATE work_claims SET status = 'completed', completed_at = $2 WHERE id = $1", [input.claimId, submittedAt]);
    await client.query("UPDATE work_packets SET status = 'completed', updated_at = $2 WHERE id = $1", [packet.id, submittedAt]);
    packet.status = 'completed';
    packet.updatedAt = submittedAt;
    await recordAuditEvent(client, { actorType: 'node', actorId: input.nodeId, action: 'work.submit.completed', targetType: 'work_packet', targetId: packet.id, metadata: { claimId: input.claimId, resultId, formatValidated: record.formatValidated, validationErrors: record.validationErrors.length } });
    await client.query('COMMIT');
    return { record, facts, workPacket: packet };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

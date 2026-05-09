import { createHash, randomUUID } from 'node:crypto';
import {
  hashJson,
  hashText,
  validateResultForPacket,
  workPacketPayloadSchema,
  type ResultPayload,
  type VolunteerNode,
  type WorkPacket,
  type WorkPacketPayload,
  type Project,
  type ExtractionResult,
  type ExtractedFactRecord,
  type ResultProvenance,
  type DatabaseState,
  type WorkerControlConfig
} from '@opencause/shared';
import { signWorkPacketPayload } from './signing';
import { createNodeToken, hashNodeToken } from './node-auth';
import { isHostedMode } from './runtime-config';
import { recordAuditEvent } from './audit';
import { updateConsensusForPacket } from './consensus';
import { createPrivateVolunteerProfileForNode } from './gamification/profiles';

const LEASE_MINUTES = 10;
const NODE_STALE_MINUTES = 3;
const DEFAULT_PACKET_EXTRACTOR = (process.env.DEFAULT_PACKET_EXTRACTOR ?? 'local-llm-v1') as
  | 'local-llm-v1'
  | 'mock-extractor-v1';

type RegisterInput = Pick<VolunteerNode, 'nodeName' | 'platform' | 'version' | 'capabilities'> & { enrollmentCode?: string };
type WorkerControlUpdate = Partial<Pick<WorkerControlConfig, 'paused' | 'idleMode' | 'minIdleSeconds' | 'maxCpuPercent'>>;
type IngestSource = {
  title: string;
  sourceText: string;
  sourceCitation: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
};

const DEMO_PROJECT: Omit<Project, 'id' | 'createdAt'> = {
  slug: 'cancer-knowledge-miner',
  name: 'Cancer Knowledge Miner',
  description:
    'Processes open-access oncology/biomedical text into structured, citation-backed research facts using Local LLM v1.',
  status: 'active'
};

export function hashEnrollmentCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function requiredEnrollmentCodes(): string[] {
  return (process.env.NODE_ENROLLMENT_CODES || process.env.NODE_ENROLLMENT_CODE || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
}

export function isNodeEnrollmentRequired(): boolean {
  return requiredEnrollmentCodes().length > 0;
}

function assertValidEnrollmentCode(db: DatabaseState, code: string | undefined): string | undefined {
  if (code) {
    const hash = hashEnrollmentCode(code);
    const enrollment = db.volunteerEnrollments.find((candidate) => candidate.enrollmentCodeHash === hash);
    if (enrollment) {
      if (enrollment.status !== 'issued') throw new Error('enrollment_code_used_or_revoked');
      return hash;
    }
  }
  const allowed = requiredEnrollmentCodes();
  if (!allowed.length) {
    if (isHostedMode()) throw new Error('enrollment_not_configured');
    return undefined;
  }
  if (!code || !allowed.includes(code)) {
    throw new Error('invalid_enrollment_code');
  }
  return hashEnrollmentCode(code);
}

const DEMO_PACKET_TEXTS = [
  {
    title: 'EGFR and osimertinib response in NSCLC',
    sourceText:
      'In NSCLC cohorts, EGFR-mutated patients showed improved response to osimertinib in a phase 3 trial. The study reported progression-free survival benefits versus comparator therapy.',
    sourceCitation: 'Demo Study A (Open Access)',
    sourceUrl: 'https://example.org/demo-study-a'
  },
  {
    title: 'PD-L1 risk stratification in melanoma',
    sourceText:
      'A melanoma retrospective analysis found PD-L1 expression associated with risk of progression under standard therapy. Authors emphasized prospective validation is still needed.',
    sourceCitation: 'Demo Study B (Open Access)',
    sourceUrl: 'https://example.org/demo-study-b'
  },
  {
    title: 'HER2 combination studied in breast cancer',
    sourceText:
      'In breast cancer, investigators studied trastuzumab with cisplatin in a pilot trial and described response heterogeneity across molecular subtypes.',
    sourceCitation: 'Demo Study C (Open Access)',
    sourceUrl: 'https://example.org/demo-study-c'
  }
] as const;

export function registerNode(
  db: DatabaseState,
  input: RegisterInput
): VolunteerNode & { node: VolunteerNode; nodeToken: string } {
  const now = new Date().toISOString();
  const enrollmentCodeHash = assertValidEnrollmentCode(db, input.enrollmentCode);
  const nodeToken = createNodeToken();
  const node: VolunteerNode & { nodeTokenHash: string } = {
    id: randomUUID(),
    nodeName: input.nodeName,
    platform: input.platform,
    version: input.version,
    capabilities: input.capabilities,
    status: 'online',
    registeredAt: now,
    lastHeartbeatAt: now,
    nodeTokenHash: hashNodeToken(nodeToken),
    enrollmentCodeHash
  };
  db.nodes.push(node);
  const profile = createPrivateVolunteerProfileForNode(db, node.id, now);
  const enrollment = enrollmentCodeHash
    ? db.volunteerEnrollments.find((candidate) => candidate.enrollmentCodeHash === enrollmentCodeHash)
    : undefined;
  if (enrollment) {
    enrollment.status = 'used';
    enrollment.usedAt = now;
    enrollment.nodeId = node.id;
  }
  recordAuditEvent(db, {
    actorType: 'node',
    actorId: node.id,
    action: 'node.registered',
    targetType: 'node',
    targetId: node.id,
    metadata: { platform: node.platform, version: node.version, capabilities: node.capabilities, volunteerProfileId: profile.id }
  });
  const { nodeTokenHash: _nodeTokenHash, enrollmentCodeHash: _enrollmentCodeHash, ...publicNode } = node;
  return { ...publicNode, node: publicNode, nodeToken };


}

export function heartbeatNode(db: DatabaseState, nodeId: string): VolunteerNode {
  const now = new Date();
  reconcileCoordinatorState(db, now);

  const node = db.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error('node_not_found');
  }
  if (node.status === 'revoked' || node.status === 'suspended') {
    throw new Error(`node_${node.status}`);
  }
  node.lastHeartbeatAt = now.toISOString();
  node.status = 'online';

  const activeClaim = db.claims.find((claim) => claim.nodeId === nodeId && claim.status === 'claimed');
  if (activeClaim) {
    activeClaim.leaseExpiresAt = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
  }

  return node;
}

function buildPacketPayload(packet: WorkPacket): WorkPacketPayload {
  return workPacketPayloadSchema.parse({
    id: packet.id,
    projectId: packet.projectId,
    title: packet.title,
    sourceText: packet.sourceText,
    sourceCitation: packet.sourceCitation,
    sourceUrl: packet.sourceUrl,
    sourcePublishedAt: packet.sourcePublishedAt,
    inputHash: packet.inputHash,
    extractor: packet.extractor,
    createdAt: packet.createdAt
  });
}

function reclaimExpiredClaims(db: DatabaseState, now: Date): void {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  for (const claim of db.claims) {
    if (claim.status !== 'claimed') {
      continue;
    }
    if (new Date(claim.leaseExpiresAt).getTime() <= nowMs) {
      claim.status = 'expired';
      claim.completedAt = nowIso;
    }
  }

  for (const packet of db.workPackets) {
    if (packet.status !== 'claimed') {
      continue;
    }
    const hasActiveClaim = db.claims.some((claim) => claim.workPacketId === packet.id && claim.status === 'claimed');
    if (!hasActiveClaim) {
      packet.status = 'queued';
      packet.updatedAt = nowIso;
    }
  }
}

function markStaleNodes(db: DatabaseState, now: Date): void {
  const staleCutoffMs = now.getTime() - NODE_STALE_MINUTES * 60_000;
  for (const node of db.nodes) {
    if (node.status === 'revoked' || node.status === 'suspended') {
      continue;
    }
    const heartbeatMs = node.lastHeartbeatAt ? new Date(node.lastHeartbeatAt).getTime() : 0;
    node.status = heartbeatMs >= staleCutoffMs ? 'online' : 'offline';
  }
}

function reclaimClaimsFromOfflineNodes(db: DatabaseState, now: Date): void {
  const nowIso = now.toISOString();

  for (const claim of db.claims) {
    if (claim.status !== 'claimed') {
      continue;
    }
    const claimNode = db.nodes.find((node) => node.id === claim.nodeId);
    if (claimNode?.status === 'offline') {
      claim.status = 'expired';
      claim.completedAt = nowIso;
    }
  }

  for (const packet of db.workPackets) {
    if (packet.status !== 'claimed') {
      continue;
    }
    const hasActiveClaim = db.claims.some((claim) => claim.workPacketId === packet.id && claim.status === 'claimed');
    if (!hasActiveClaim) {
      packet.status = 'queued';
      packet.updatedAt = nowIso;
    }
  }
}

export function reconcileCoordinatorState(db: DatabaseState, now: Date = new Date()): void {
  markStaleNodes(db, now);
  reclaimClaimsFromOfflineNodes(db, now);
  reclaimExpiredClaims(db, now);
}

export function claimWork(db: DatabaseState, nodeId: string): { claimId: string; packet: WorkPacketPayload; signature: string } | null {
  reconcileCoordinatorState(db);

  const node = db.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error('node_not_found');
  }
  if (node.status === 'revoked' || node.status === 'suspended') {
    throw new Error(`node_${node.status}`);
  }
  if (node.status === 'offline') {
    throw new Error('node_offline');
  }

  const now = new Date();

  const existingClaim = db.claims.find((claim) => claim.nodeId === nodeId && claim.status === 'claimed');
  if (existingClaim) {
    const existingPacket = db.workPackets.find((packet) => packet.id === existingClaim.workPacketId);
    if (existingPacket) {
      return {
        claimId: existingClaim.id,
        packet: buildPacketPayload(existingPacket),
        signature: existingPacket.signature
      };
    }
  }

  const packet = db.workPackets.find((p) => p.status === 'queued' && !db.claims.some((claim) => claim.workPacketId === p.id && claim.nodeId === nodeId && claim.status === 'completed'));
  if (!packet) {
    return null;
  }

  const claimId = randomUUID();
  db.claims.push({
    id: claimId,
    nodeId,
    workPacketId: packet.id,
    status: 'claimed',
    claimedAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString(),
    completedAt: null
  });

  packet.status = 'claimed';
  packet.updatedAt = now.toISOString();
  recordAuditEvent(db, {
    actorType: 'node',
    actorId: nodeId,
    action: 'work.claim.created',
    targetType: 'work_packet',
    targetId: packet.id,
    metadata: { claimId }
  });

  return {
    claimId,
    packet: buildPacketPayload(packet),
    signature: packet.signature
  };
}

export function submitResult(
  db: DatabaseState,
  input: {
    nodeId: string;
    claimId: string;
    workPacketId: string;
    extractorVersion: 'Local LLM v1' | 'Mock Extractor v1';
    result: ResultPayload;
    provenance?: ResultProvenance;
  }
): { record: ExtractionResult; facts: ExtractedFactRecord[]; workPacket: WorkPacket } {
  const packet = db.workPackets.find((p) => p.id === input.workPacketId);
  if (!packet) {
    throw new Error('work_packet_not_found');
  }

  const claim = db.claims.find((c) => c.id === input.claimId);
  if (!claim || claim.nodeId !== input.nodeId || claim.workPacketId !== packet.id || claim.status !== 'claimed') {
    throw new Error('invalid_claim');
  }

  const now = new Date();
  if (new Date(claim.leaseExpiresAt).getTime() <= now.getTime()) {
    claim.status = 'expired';
    claim.completedAt = now.toISOString();
    if (packet.status !== 'completed') {
      packet.status = 'queued';
      packet.updatedAt = now.toISOString();
    }
    throw new Error('claim_expired');
  }

  if (packet.extractor === 'local-llm-v1' && input.extractorVersion !== 'Local LLM v1') {
    throw new Error('extractor_version_mismatch');
  }
  if (packet.extractor === 'mock-extractor-v1' && input.extractorVersion !== 'Mock Extractor v1') {
    throw new Error('extractor_version_mismatch');
  }

  const packetPayload = buildPacketPayload(packet);

  const validation = validateResultForPacket(input.result, packetPayload);
  const submittedAt = new Date().toISOString();

  const node = db.nodes.find((n) => n.id === input.nodeId);
  if (!node) {
    throw new Error('node_not_found');
  }

  const record: ExtractionResult = {
    id: randomUUID(),
    workPacketId: packet.id,
    nodeId: input.nodeId,
    claimId: claim.id,
    extractorVersion: input.extractorVersion,
    resultHash: hashJson(input.result),
    validated: validation.valid,
    formatValidated: validation.valid,
    consensusStatus: 'consensus_pending',
    reviewStatus: validation.valid ? 'not_reviewed' : 'needs_human_review',
    validationErrors: validation.errors,
    warnings: input.result.warnings,
    summary: input.result.summary,
    submittedAt,
    provenance:
      input.provenance ??
      {
        workerVersion: node.version,
        extractorVersion: input.extractorVersion,
        promptVersion: 'unknown',
        promptHash: 'unknown',
        packetSchemaVersion: 'work-packet-v1',
        extractionTimestamp: submittedAt,
        workerPlatform: node.platform,
        workerCapabilities: node.capabilities,
        resultValidationVersion: 'format-validation-v1'
      }
  };

  const facts: ExtractedFactRecord[] = input.result.facts.map((fact) => ({
    id: randomUUID(),
    resultId: record.id,
    relationshipType: fact.relationshipType,
    evidenceSentence: fact.evidenceSentence,
    confidence: fact.confidence,
    cancerType: fact.cancerType,
    geneOrBiomarker: fact.geneOrBiomarker,
    drugOrCompound: fact.drugOrCompound,
    sourceCitation: packet.sourceCitation,
    sourceUrl: packet.sourceUrl
  }));

  claim.status = 'completed';
  claim.completedAt = submittedAt;

  db.results.push(record);
  db.facts.push(...facts);

  const consensusStatus = updateConsensusForPacket(db, packet.id);
  packet.status = consensusStatus === 'consensus_passed' || consensusStatus === 'consensus_failed' ? 'completed' : 'queued';
  packet.updatedAt = submittedAt;
  recordAuditEvent(db, {
    actorType: 'node',
    actorId: input.nodeId,
    action: 'work.submit.completed',
    targetType: 'work_packet',
    targetId: packet.id,
    metadata: {
      claimId: input.claimId,
      resultId: record.id,
      formatValidated: record.formatValidated,
      validationErrors: record.validationErrors.length
    }
  });

  return { record, facts, workPacket: packet };
}

export function seedDemoData(db: DatabaseState): { project: Project; packetsCreated: number } {
  const now = new Date().toISOString();
  let project = db.projects.find((p) => p.slug === DEMO_PROJECT.slug);

  if (!project) {
    project = {
      id: randomUUID(),
      ...DEMO_PROJECT,
      createdAt: now
    };
    db.projects.push(project);
  }

  let packetsCreated = 0;

  for (const packetTemplate of DEMO_PACKET_TEXTS) {
    const exists = db.workPackets.find(
      (packet) => packet.projectId === project.id && packet.title === packetTemplate.title
    );

    if (exists) {
      continue;
    }

    const packetPayload: WorkPacketPayload = {
      id: randomUUID(),
      projectId: project.id,
      title: packetTemplate.title,
      sourceText: packetTemplate.sourceText,
      sourceCitation: packetTemplate.sourceCitation,
      sourceUrl: packetTemplate.sourceUrl,
      inputHash: hashText(packetTemplate.sourceText),
      extractor: DEFAULT_PACKET_EXTRACTOR,
      createdAt: now
    };

    const workPacket: WorkPacket = {
      ...packetPayload,
      signature: signWorkPacketPayload(packetPayload),
      status: 'queued',
      updatedAt: now
    };

    db.workPackets.push(workPacket);
    packetsCreated += 1;
  }

  return { project, packetsCreated };
}

export function getOrCreateProject(
  db: DatabaseState,
  input: { slug: string; name: string; description: string; status?: string }
): Project {
  const existing = db.projects.find((project) => project.slug === input.slug);
  if (existing) {
    return existing;
  }

  const project: Project = {
    id: randomUUID(),
    slug: input.slug,
    name: input.name,
    description: input.description,
    status: input.status ?? 'active',
    createdAt: new Date().toISOString()
  };
  db.projects.push(project);
  return project;
}

export function createWorkPacketsFromSources(
  db: DatabaseState,
  input: { projectId: string; sources: IngestSource[]; extractor?: 'local-llm-v1' | 'mock-extractor-v1' }
): { packetsCreated: number; packetsSkipped: number } {
  const now = new Date().toISOString();
  let packetsCreated = 0;
  let packetsSkipped = 0;
  const extractor = input.extractor ?? DEFAULT_PACKET_EXTRACTOR;

  for (const source of input.sources) {
    const exists = db.workPackets.find((packet) => packet.projectId === input.projectId && packet.sourceUrl === source.sourceUrl);
    if (exists) {
      packetsSkipped += 1;
      continue;
    }

    const packetPayload: WorkPacketPayload = {
      id: randomUUID(),
      projectId: input.projectId,
      title: source.title,
      sourceText: source.sourceText,
      sourceCitation: source.sourceCitation,
      sourceUrl: source.sourceUrl,
      sourcePublishedAt: source.sourcePublishedAt,
      inputHash: hashText(source.sourceText),
      extractor,
      createdAt: now
    };

    const packet: WorkPacket = {
      ...packetPayload,
      signature: signWorkPacketPayload(packetPayload),
      status: 'queued',
      updatedAt: now
    };

    db.workPackets.push(packet);
    packetsCreated += 1;
  }

  return { packetsCreated, packetsSkipped };
}

export function listProjects(db: DatabaseState): Project[] {
  reconcileCoordinatorState(db);
  return db.projects;
}

export function listWorkPackets(
  db: DatabaseState
): Array<Omit<WorkPacket, 'sourceText' | 'signature'> & { sourceTextPreview: string }> {
  reconcileCoordinatorState(db);
  return db.workPackets.map(({ sourceText, signature, ...packet }) => ({
    ...packet,
    sourceTextPreview: sourceText.slice(0, 240)
  }));
}

export function listResults(db: DatabaseState): Array<ExtractionResult & { facts: ExtractedFactRecord[] }> {
  reconcileCoordinatorState(db);
  return db.results.map((result) => ({
    ...result,
    facts: db.facts.filter((f) => f.resultId === result.id)
  }));
}

export function listNodes(db: DatabaseState): VolunteerNode[] {
  reconcileCoordinatorState(db);
  return db.nodes;
}

export function getWorkerControl(db: DatabaseState): WorkerControlConfig {
  return db.workerControl;
}

export function updateWorkerControl(db: DatabaseState, update: WorkerControlUpdate): WorkerControlConfig {
  db.workerControl = {
    ...db.workerControl,
    ...update,
    updatedAt: new Date().toISOString()
  };
  recordAuditEvent(db, {
    actorType: 'admin',
    action: 'worker_control.updated',
    targetType: 'worker_control',
    targetId: 'singleton',
    metadata: update
  });
  return db.workerControl;
}

export function triggerRunNow(db: DatabaseState): WorkerControlConfig {
  db.workerControl.runNowToken += 1;
  db.workerControl.updatedAt = new Date().toISOString();
  recordAuditEvent(db, {
    actorType: 'admin',
    action: 'worker_control.run_now',
    targetType: 'worker_control',
    targetId: 'singleton',
    metadata: { runNowToken: db.workerControl.runNowToken }
  });
  return db.workerControl;
}

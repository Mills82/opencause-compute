import { randomUUID } from 'node:crypto';
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
  type DatabaseState
} from '@opencause/shared';
import { signWorkPacketPayload } from './signing';

const LEASE_MINUTES = 10;

type RegisterInput = Pick<VolunteerNode, 'nodeName' | 'platform' | 'version' | 'capabilities'>;

const DEMO_PROJECT: Omit<Project, 'id' | 'createdAt'> = {
  slug: 'cancer-knowledge-miner',
  name: 'Cancer Knowledge Miner',
  description:
    'Processes open-access oncology/biomedical text into structured, citation-backed research facts using Mock Extractor v1.',
  status: 'active'
};

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

export function registerNode(db: DatabaseState, input: RegisterInput): VolunteerNode {
  const now = new Date().toISOString();
  const node: VolunteerNode = {
    id: randomUUID(),
    nodeName: input.nodeName,
    platform: input.platform,
    version: input.version,
    capabilities: input.capabilities,
    status: 'online',
    registeredAt: now,
    lastHeartbeatAt: now
  };
  db.nodes.push(node);
  return node;
}

export function heartbeatNode(db: DatabaseState, nodeId: string): VolunteerNode {
  const node = db.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error('node_not_found');
  }
  node.lastHeartbeatAt = new Date().toISOString();
  node.status = 'online';
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
    extractor: 'mock-extractor-v1',
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

export function claimWork(db: DatabaseState, nodeId: string): { claimId: string; packet: WorkPacketPayload; signature: string } | null {
  const node = db.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error('node_not_found');
  }

  const now = new Date();
  reclaimExpiredClaims(db, now);

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

  const packet = db.workPackets.find((p) => p.status === 'queued');
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

  return {
    claimId,
    packet: buildPacketPayload(packet),
    signature: packet.signature
  };
}

export function submitResult(
  db: DatabaseState,
  input: { nodeId: string; claimId: string; workPacketId: string; result: ResultPayload }
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

  const packetPayload = buildPacketPayload(packet);

  const validation = validateResultForPacket(input.result, packetPayload);
  const submittedAt = new Date().toISOString();

  const record: ExtractionResult = {
    id: randomUUID(),
    workPacketId: packet.id,
    nodeId: input.nodeId,
    claimId: claim.id,
    extractorVersion: 'Mock Extractor v1',
    resultHash: hashJson(input.result),
    validated: validation.valid,
    validationErrors: validation.errors,
    warnings: input.result.warnings,
    summary: input.result.summary,
    submittedAt
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

  packet.status = 'completed';
  packet.updatedAt = submittedAt;

  db.results.push(record);
  db.facts.push(...facts);

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
      extractor: 'mock-extractor-v1',
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

export function listProjects(db: DatabaseState): Project[] {
  return db.projects;
}

export function listWorkPackets(db: DatabaseState): WorkPacket[] {
  return db.workPackets;
}

export function listResults(db: DatabaseState): Array<ExtractionResult & { facts: ExtractedFactRecord[] }> {
  return db.results.map((result) => ({
    ...result,
    facts: db.facts.filter((f) => f.resultId === result.id)
  }));
}

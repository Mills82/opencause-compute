import { createHash } from 'node:crypto';
import type { DatabaseState, ExtractedClaimRecord, ExtractionResult, WorkPacket } from '@opencause/shared';

function norm(value?: string): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type EvidenceCard = {
  id: string;
  source: {
    citation: string;
    url: string;
    title?: string;
    publishedAt?: string;
  };
  evidence: {
    sentence: string;
    context?: string;
    sectionTitle?: string;
    sectionType?: string;
    charStart?: number;
    charEnd?: number;
  };
  claim: {
    type: string;
    cancer?: string;
    biomarker?: string;
    intervention?: string;
    variant?: string;
    outcome?: string;
    effect: string;
    polarity: string;
    evidenceRole: string;
    evidenceModality: string;
    studyContext: string;
  };
  quality: {
    confidence: number;
    reviewPriority?: string;
    consensusStatus?: string;
    reviewStatus?: string;
    warnings: string[];
    modelName?: string;
    promptVersion?: string;
  };
  fingerprints: {
    evidenceSentenceHash: string;
    normalizedClaimFingerprint: string;
  };
};

export function normalizedClaimFingerprint(claim: ExtractedClaimRecord): string {
  const parts = [
    claim.claimType,
    hash(norm(claim.exactEvidenceSentence)),
    norm(claim.cancerType),
    norm(claim.biomarkerMention),
    norm(claim.drugOrInterventionMention),
    norm(claim.outcomeMention),
    claim.polarity,
    claim.direction
  ];
  return hash(parts.join('|'));
}

export function evidenceCardFromClaim(input: { claim: ExtractedClaimRecord; result?: ExtractionResult; packet?: WorkPacket }): EvidenceCard {
  const { claim, result, packet } = input;
  return {
    id: claim.id,
    source: {
      citation: claim.sourceCitation,
      url: claim.sourceUrl,
      title: packet?.title,
      publishedAt: packet?.sourcePublishedAt
    },
    evidence: {
      sentence: claim.exactEvidenceSentence,
      context: claim.evidenceContext,
      sectionTitle: claim.sectionTitle ?? packet?.sectionTitle,
      sectionType: claim.sectionType ?? packet?.sectionType,
      charStart: claim.charStart,
      charEnd: claim.charEnd
    },
    claim: {
      type: claim.claimType,
      cancer: claim.cancerType,
      biomarker: claim.biomarkerMention,
      intervention: claim.drugOrInterventionMention,
      variant: claim.variantMention,
      outcome: claim.outcomeMention,
      effect: claim.direction,
      polarity: claim.polarity,
      evidenceRole: claim.evidenceOrigin,
      evidenceModality: claim.evidenceType,
      studyContext: claim.studyContext
    },
    quality: {
      confidence: claim.confidence,
      reviewPriority: claim.reviewPriority,
      consensusStatus: result?.consensusStatus,
      reviewStatus: result?.reviewStatus,
      warnings: result?.warnings ?? [],
      modelName: result?.provenance?.modelName,
      promptVersion: result?.provenance?.promptVersion
    },
    fingerprints: {
      evidenceSentenceHash: hash(norm(claim.exactEvidenceSentence)),
      normalizedClaimFingerprint: normalizedClaimFingerprint(claim)
    }
  };
}

export function listEvidenceCards(db: DatabaseState, limit = 100): EvidenceCard[] {
  const resultById = new Map(db.results.map((result) => [result.id, result]));
  const packetById = new Map(db.workPackets.map((packet) => [packet.id, packet]));
  return db.extractedClaims.slice(0, limit).map((claim) => {
    const result = resultById.get(claim.resultId);
    return evidenceCardFromClaim({ claim, result, packet: result ? packetById.get(result.workPacketId) : undefined });
  });
}

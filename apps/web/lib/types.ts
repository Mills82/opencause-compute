import type {
  DatabaseState,
  WorkPacketPayload,
  VolunteerNode,
  WorkClaim,
  WorkPacket,
  ResultPayload,
  Project,
  ExtractionResult,
  ExtractedFactRecord
} from '@opencause/shared';

export type AppDatabase = DatabaseState;

export type RegisterNodeInput = Pick<VolunteerNode, 'nodeName' | 'platform' | 'version' | 'capabilities'>;
export type ClaimOutput = { claim: WorkClaim; packet: WorkPacketPayload; signature: string } | null;
export type SubmitInput = {
  nodeId: string;
  claimId: string;
  workPacketId: string;
  extractorVersion: 'Local LLM v1' | 'Mock Extractor v1';
  result: ResultPayload;
};

export type SeedOutput = {
  project: Project;
  packetsCreated: number;
};

export type SubmitOutput = {
  record: ExtractionResult;
  facts: ExtractedFactRecord[];
  workPacket: WorkPacket;
};

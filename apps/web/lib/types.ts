import type {
  DatabaseState,
  WorkPacketPayload,
  VolunteerNode,
  WorkClaim,
  WorkPacket,
  ResultPayload,
  Project,
  ExtractionResult,
  ExtractedClaimRecord
} from '@opencause/shared';

export type AppDatabase = DatabaseState;

export type RegisterNodeInput = Pick<VolunteerNode, 'nodeName' | 'platform' | 'version' | 'capabilities'>;
export type ClaimOutput = { claim: WorkClaim; packet: WorkPacketPayload; signature: string } | null;
export type SubmitInput = {
  nodeId: string;
  claimId: string;
  workPacketId: string;
  extractorVersion: 'Local LLM v2';
  result: ResultPayload;
};

export type SeedOutput = {
  project: Project;
  packetsCreated: number;
};

export type SubmitOutput = {
  record: ExtractionResult;
  claims: ExtractedClaimRecord[];
  workPacket: WorkPacket;
};

import { z } from 'zod';

export const relationshipTypeSchema = z.enum([
  'associated_with_response',
  'associated_with_resistance',
  'associated_with_risk',
  'associated_with_progression',
  'studied_with',
  'unclear'
]);

export const extractedFactSchema = z.object({
  cancerType: z.string().min(1).optional(),
  geneOrBiomarker: z.string().min(1).optional(),
  drugOrCompound: z.string().min(1).optional(),
  relationshipType: relationshipTypeSchema,
  evidenceSentence: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const resultPayloadSchema = z.object({
  facts: z.array(extractedFactSchema),
  summary: z.string().min(1),
  warnings: z.array(z.string())
});

export const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  createdAt: z.string()
});

export const workPacketPayloadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  sourceText: z.string().min(1),
  sourceCitation: z.string().min(1),
  sourceUrl: z.string().url(),
  sourcePublishedAt: z.string().optional(),
  inputHash: z.string(),
  extractor: z.literal('mock-extractor-v1'),
  createdAt: z.string()
});

export const workPacketSchema = workPacketPayloadSchema.extend({
  signature: z.string(),
  status: z.enum(['queued', 'claimed', 'completed']),
  updatedAt: z.string()
});

export const volunteerNodeSchema = z.object({
  id: z.string(),
  nodeName: z.string().min(1),
  platform: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(['online', 'offline']),
  capabilities: z.array(z.string()),
  registeredAt: z.string(),
  lastHeartbeatAt: z.string().nullable()
});

export const workClaimSchema = z.object({
  id: z.string(),
  workPacketId: z.string(),
  nodeId: z.string(),
  status: z.enum(['claimed', 'completed', 'expired']),
  claimedAt: z.string(),
  leaseExpiresAt: z.string(),
  completedAt: z.string().nullable()
});

export const extractionResultSchema = z.object({
  id: z.string(),
  workPacketId: z.string(),
  nodeId: z.string(),
  claimId: z.string(),
  extractorVersion: z.literal('Mock Extractor v1'),
  resultHash: z.string(),
  validated: z.boolean(),
  validationErrors: z.array(z.string()),
  warnings: z.array(z.string()),
  summary: z.string(),
  submittedAt: z.string()
});

export const extractedFactRecordSchema = extractedFactSchema.extend({
  id: z.string(),
  resultId: z.string(),
  sourceCitation: z.string(),
  sourceUrl: z.string().url()
});

export const databaseSchema = z.object({
  projects: z.array(projectSchema),
  workPackets: z.array(workPacketSchema),
  nodes: z.array(volunteerNodeSchema),
  claims: z.array(workClaimSchema),
  results: z.array(extractionResultSchema),
  facts: z.array(extractedFactRecordSchema)
});

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type ResultPayload = z.infer<typeof resultPayloadSchema>;
export type Project = z.infer<typeof projectSchema>;
export type WorkPacketPayload = z.infer<typeof workPacketPayloadSchema>;
export type WorkPacket = z.infer<typeof workPacketSchema>;
export type VolunteerNode = z.infer<typeof volunteerNodeSchema>;
export type WorkClaim = z.infer<typeof workClaimSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedFactRecord = z.infer<typeof extractedFactRecordSchema>;
export type DatabaseState = z.infer<typeof databaseSchema>;

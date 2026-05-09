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
  extractor: z.enum(['local-llm-v1', 'mock-extractor-v1']),
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
  status: z.enum(['online', 'offline', 'suspended', 'revoked']),
  capabilities: z.array(z.string()),
  registeredAt: z.string(),
  lastHeartbeatAt: z.string().nullable(),
  nodeTokenHash: z.string().optional(),
  enrollmentCodeHash: z.string().optional(),
  revokedAt: z.string().nullable().optional(),
  suspendedAt: z.string().nullable().optional()
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

export const resultProvenanceSchema = z.object({
  workerVersion: z.string(),
  extractorVersion: z.string(),
  modelName: z.string().optional(),
  modelProvider: z.string().optional(),
  promptVersion: z.string(),
  promptHash: z.string(),
  packetSchemaVersion: z.string(),
  extractionTimestamp: z.string(),
  localLlmEndpointType: z.string().optional(),
  workerPlatform: z.string(),
  workerCapabilities: z.array(z.string()),
  resultValidationVersion: z.string()
});

export const extractionResultSchema = z.object({
  id: z.string(),
  workPacketId: z.string(),
  nodeId: z.string(),
  claimId: z.string(),
  extractorVersion: z.enum(['Local LLM v1', 'Mock Extractor v1']),
  resultHash: z.string(),
  validated: z.boolean(),
  formatValidated: z.boolean().optional(),
  consensusStatus: z.enum(['consensus_pending', 'consensus_passed', 'consensus_failed']).default('consensus_pending'),
  reviewStatus: z.enum(['not_reviewed', 'needs_human_review', 'human_reviewed']).default('not_reviewed'),
  validationErrors: z.array(z.string()),
  warnings: z.array(z.string()),
  summary: z.string(),
  submittedAt: z.string(),
  provenance: resultProvenanceSchema.optional()
});

export const extractedFactRecordSchema = extractedFactSchema.extend({
  id: z.string(),
  resultId: z.string(),
  sourceCitation: z.string(),
  sourceUrl: z.string().url()
});

export const auditEventSchema = z.object({
  id: z.string(),
  actorType: z.enum(['admin', 'cron', 'node', 'system']),
  actorId: z.string().optional(),
  action: z.string(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string()
});

export const volunteerEnrollmentSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  enrollmentCodeHash: z.string(),
  status: z.enum(['issued', 'used', 'revoked']),
  createdAt: z.string(),
  usedAt: z.string().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  source: z.enum(['public_signup', 'admin']).default('public_signup')
});

export const privacyModeSchema = z.enum(['private', 'public_anonymous', 'public_named']);

export const volunteerProfileSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  slug: z.string().min(1),
  privacyMode: privacyModeSchema,
  publicProfileEnabled: z.boolean(),
  avatarColor: z.string().min(1),
  bio: z.string().optional(),
  setupTokenHash: z.string().optional(),
  setupTokenExpiresAt: z.string().nullable().optional(),
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable().optional(),
  statsUpdatedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const volunteerProfileNodeSchema = z.object({
  id: z.string(),
  volunteerProfileId: z.string(),
  nodeId: z.string(),
  attachedAt: z.string(),
  detachedAt: z.string().nullable().optional()
});

export const teamSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(''),
  visibility: z.enum(['public', 'private']),
  createdByVolunteerProfileId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  statsUpdatedAt: z.string().nullable().optional()
});

export const teamMembershipSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  volunteerProfileId: z.string(),
  role: z.enum(['member', 'captain']),
  status: z.enum(['active', 'left', 'removed']),
  joinedAt: z.string(),
  leftAt: z.string().nullable().optional()
});

export const badgeDefinitionRecordSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  criteriaKind: z.string(),
  criteriaValue: z.number().int().min(0),
  iconName: z.string().optional(),
  createdAt: z.string()
});

export const volunteerBadgeSchema = z.object({
  id: z.string(),
  volunteerProfileId: z.string(),
  badgeSlug: z.string(),
  awardedAt: z.string(),
  sourceKind: z.string().optional(),
  sourceId: z.string().optional()
});

export const statsWindowSchema = z.enum(['all_time', 'weekly', 'monthly']);

export const volunteerStatsSnapshotSchema = z.object({
  id: z.string(),
  volunteerProfileId: z.string(),
  window: statsWindowSchema,
  windowStart: z.string().nullable().optional(),
  windowEnd: z.string().nullable().optional(),
  contributionScore: z.number().int().min(0),
  sectionsProcessed: z.number().int().min(0),
  packetsSubmitted: z.number().int().min(0),
  formatValidatedSubmissions: z.number().int().min(0),
  formatRejectedSubmissions: z.number().int().min(0),
  consensusPassedContributions: z.number().int().min(0),
  consensusFailedContributions: z.number().int().min(0),
  humanReviewedAcceptedContributions: z.number().int().min(0),
  idleMinutesDonated: z.number().int().min(0),
  distinctActiveDays: z.number().int().min(0),
  currentStreakDays: z.number().int().min(0),
  longestStreakDays: z.number().int().min(0),
  badgesCount: z.number().int().min(0),
  computedAt: z.string()
});

export const teamStatsSnapshotSchema = volunteerStatsSnapshotSchema.omit({ volunteerProfileId: true, badgesCount: true }).extend({
  teamId: z.string(),
  memberCount: z.number().int().min(0),
  activeMemberCount: z.number().int().min(0)
});

export const impactDigestSchema = z.object({
  id: z.string(),
  volunteerProfileId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  sectionsProcessed: z.number().int().min(0),
  formatValidatedSubmissions: z.number().int().min(0),
  consensusPassedContributions: z.number().int().min(0),
  idleMinutesDonated: z.number().int().min(0),
  badgesAwarded: z.number().int().min(0),
  teamRank: z.number().int().min(1).nullable().optional(),
  previewText: z.string(),
  createdAt: z.string(),
  deliveredAt: z.string().nullable().optional()
});

export const impactCardSchema = z.object({
  id: z.string(),
  volunteerProfileId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  cardType: z.enum(['volunteer_weekly', 'team_weekly', 'global']),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  metricLabel: z.string(),
  metricValue: z.string(),
  accentColor: z.string(),
  publicEnabled: z.boolean(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  createdAt: z.string()
});

export const ingestionRunSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['pubmed_abstract', 'pmc_oa_full_text', 'combined']),
  mode: z.enum(['manual', 'cron']),
  status: z.enum(['running', 'completed', 'failed', 'partial_failed']),
  query: z.string(),
  retmax: z.number().int(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  fetchedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  failureReasons: z.array(z.string()),
  packetsCreated: z.number().int().min(0),
  packetsSkipped: z.number().int().min(0),
  usedNcbiEmail: z.boolean(),
  usedNcbiApiKey: z.boolean()
});

export const workerControlConfigSchema = z.object({
  paused: z.boolean(),
  idleMode: z.enum(['user-and-cpu', 'cpu-only']),
  minIdleSeconds: z.number().int().min(0),
  maxCpuPercent: z.number().min(1).max(100),
  runNowToken: z.number().int().min(0),
  updatedAt: z.string()
});

export const databaseSchema = z.object({
  projects: z.array(projectSchema),
  workPackets: z.array(workPacketSchema),
  nodes: z.array(volunteerNodeSchema),
  claims: z.array(workClaimSchema),
  results: z.array(extractionResultSchema),
  facts: z.array(extractedFactRecordSchema),
  ingestionRuns: z.array(ingestionRunSchema).default([]),
  auditEvents: z.array(auditEventSchema).default([]),
  volunteerEnrollments: z.array(volunteerEnrollmentSchema).default([]),
  volunteerProfiles: z.array(volunteerProfileSchema).default([]),
  volunteerProfileNodes: z.array(volunteerProfileNodeSchema).default([]),
  teams: z.array(teamSchema).default([]),
  teamMemberships: z.array(teamMembershipSchema).default([]),
  badgeDefinitions: z.array(badgeDefinitionRecordSchema).default([]),
  volunteerBadges: z.array(volunteerBadgeSchema).default([]),
  volunteerStatsSnapshots: z.array(volunteerStatsSnapshotSchema).default([]),
  teamStatsSnapshots: z.array(teamStatsSnapshotSchema).default([]),
  impactDigests: z.array(impactDigestSchema).default([]),
  impactCards: z.array(impactCardSchema).default([]),
  workerControl: workerControlConfigSchema
});

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type ResultPayload = z.infer<typeof resultPayloadSchema>;
export type Project = z.infer<typeof projectSchema>;
export type WorkPacketPayload = z.infer<typeof workPacketPayloadSchema>;
export type WorkPacket = z.infer<typeof workPacketSchema>;
export type VolunteerNode = z.infer<typeof volunteerNodeSchema>;
export type WorkClaim = z.infer<typeof workClaimSchema>;
export type ResultProvenance = z.infer<typeof resultProvenanceSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedFactRecord = z.infer<typeof extractedFactRecordSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type VolunteerEnrollment = z.infer<typeof volunteerEnrollmentSchema>;
export type PrivacyMode = z.infer<typeof privacyModeSchema>;
export type VolunteerProfile = z.infer<typeof volunteerProfileSchema>;
export type VolunteerProfileNode = z.infer<typeof volunteerProfileNodeSchema>;
export type Team = z.infer<typeof teamSchema>;
export type TeamMembership = z.infer<typeof teamMembershipSchema>;
export type BadgeDefinitionRecord = z.infer<typeof badgeDefinitionRecordSchema>;
export type VolunteerBadge = z.infer<typeof volunteerBadgeSchema>;
export type VolunteerStatsSnapshot = z.infer<typeof volunteerStatsSnapshotSchema>;
export type TeamStatsSnapshot = z.infer<typeof teamStatsSnapshotSchema>;
export type ImpactDigest = z.infer<typeof impactDigestSchema>;
export type ImpactCard = z.infer<typeof impactCardSchema>;
export type IngestionRun = z.infer<typeof ingestionRunSchema>;
export type WorkerControlConfig = z.infer<typeof workerControlConfigSchema>;
export type DatabaseState = z.infer<typeof databaseSchema>;

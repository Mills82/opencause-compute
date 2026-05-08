export const drizzleStyleSchema = {
  projects: {
    id: 'text primary key',
    slug: 'text unique not null',
    name: 'text not null',
    description: 'text not null',
    status: 'text not null',
    createdAt: 'text not null'
  },
  workPackets: {
    id: 'text primary key',
    projectId: 'text references projects(id)',
    title: 'text not null',
    sourceText: 'text not null',
    sourceCitation: 'text not null',
    sourceUrl: 'text not null',
    sourcePublishedAt: 'text',
    inputHash: 'text not null',
    signature: 'text not null',
    status: 'text not null',
    createdAt: 'text not null',
    updatedAt: 'text not null'
  },
  volunteerNodes: {
    id: 'text primary key',
    nodeName: 'text not null',
    platform: 'text not null',
    version: 'text not null',
    status: 'text not null',
    capabilities: 'text',
    lastHeartbeatAt: 'text',
    registeredAt: 'text not null'
  },
  workClaims: {
    id: 'text primary key',
    workPacketId: 'text references workPackets(id)',
    nodeId: 'text references volunteerNodes(id)',
    status: 'text not null',
    claimedAt: 'text not null',
    leaseExpiresAt: 'text not null',
    completedAt: 'text'
  },
  extractionResults: {
    id: 'text primary key',
    workPacketId: 'text references workPackets(id)',
    nodeId: 'text references volunteerNodes(id)',
    claimId: 'text references workClaims(id)',
    extractorVersion: 'text not null',
    resultHash: 'text not null',
    validated: 'integer not null',
    validationErrors: 'text',
    warnings: 'text',
    summary: 'text not null',
    submittedAt: 'text not null'
  },
  extractedFacts: {
    id: 'text primary key',
    resultId: 'text references extractionResults(id)',
    relationshipType: 'text not null',
    evidenceSentence: 'text not null',
    confidence: 'real not null',
    cancerType: 'text',
    geneOrBiomarker: 'text',
    drugOrCompound: 'text',
    sourceCitation: 'text not null',
    sourceUrl: 'text not null'
  }
} as const;

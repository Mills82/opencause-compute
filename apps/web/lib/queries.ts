import { getWorkerControl, listNodes, reconcileCoordinatorState } from './coordinator';
import { loadDb, withDb } from './db';
import { packetSigningDiagnostics } from './signing-diagnostics';

export async function getDashboardData() {
  const db = await withDb((state) => {
    reconcileCoordinatorState(state);
    return state;
  });
  return {
    projectCount: db.projects.length,
    packetCount: db.workPackets.length,
    queuedCount: db.workPackets.filter((p) => p.status === 'queued').length,
    claimedPacketCount: db.workPackets.filter((p) => p.status === 'claimed').length,
    completedPacketCount: db.workPackets.filter((p) => p.status === 'completed').length,
    availableToFirstPassCount: db.workPackets.filter((p) => p.status === 'queued' && !db.results.some((r) => r.workPacketId === p.id)).length,
    awaitingIndependentValidationCount: db.workPackets.filter((p) => p.status === 'queued' && db.results.some((r) => r.workPacketId === p.id) && !db.results.some((r) => r.workPacketId === p.id && r.consensusStatus === 'consensus_passed')).length,
    fullyConsensusCompletedCount: db.workPackets.filter((p) => db.results.some((r) => r.workPacketId === p.id && r.consensusStatus === 'consensus_passed')).length,
    failedOrNeedsReviewPacketCount: db.workPackets.filter((p) => db.results.some((r) => r.workPacketId === p.id && (!(r.formatValidated ?? r.validated) || r.reviewStatus === 'needs_human_review'))).length,
    activeClaimCount: db.claims.filter((claim) => claim.status === 'claimed').length,
    expiredClaimCount: db.claims.filter((claim) => claim.status === 'expired').length,
    nodeCount: db.nodes.length,
    onlineNodeCount: db.nodes.filter((node) => node.status === 'online').length,
    offlineNodeCount: db.nodes.filter((node) => node.status === 'offline').length,
    suspendedNodeCount: db.nodes.filter((node) => node.status === 'suspended').length,
    revokedNodeCount: db.nodes.filter((node) => node.status === 'revoked').length,
    resultCount: db.results.length,
    formatValidatedCount: db.results.filter((r) => r.formatValidated ?? r.validated).length,
    consensusPendingCount: db.results.filter((r) => r.consensusStatus === 'consensus_pending').length,
    consensusPassedCount: db.results.filter((r) => r.consensusStatus === 'consensus_passed').length,
    humanReviewNeededCount: db.results.filter((r) => r.reviewStatus === 'needs_human_review').length,
    failedValidationCount: db.results.filter((r) => !(r.formatValidated ?? r.validated) || r.consensusStatus === 'consensus_failed').length,
    workerControl: db.workerControl,
    ingestionRunCount: db.ingestionRuns.length,
    failedIngestionRunCount: db.ingestionRuns.filter((run) => run.status === 'failed' || run.status === 'partial_failed').length,
    recentIngestionRuns: db.ingestionRuns.slice(0, 5),
    auditEventCount: db.auditEvents.length,
    recentAuditEvents: db.auditEvents.slice(0, 5),
    volunteerEnrollmentCount: db.volunteerEnrollments.length,
    issuedVolunteerEnrollmentCount: db.volunteerEnrollments.filter((enrollment) => enrollment.status === 'issued').length,
    usedVolunteerEnrollmentCount: db.volunteerEnrollments.filter((enrollment) => enrollment.status === 'used').length,
    revokedVolunteerEnrollmentCount: db.volunteerEnrollments.filter((enrollment) => enrollment.status === 'revoked').length,
    recentVolunteerEnrollments: db.volunteerEnrollments.slice(0, 5),
    volunteerProfileCount: db.volunteerProfiles.length,
    publicVolunteerProfileCount: db.volunteerProfiles.filter((profile) => profile.publicProfileEnabled && profile.privacyMode !== 'private').length,
    teamCount: db.teams.length,
    volunteerBadgeCount: db.volunteerBadges.length,
    signingDiagnostics: packetSigningDiagnostics()
  };
}

export async function getProjects() {
  const db = await loadDb();
  return db.projects.map((project) => ({
    ...project,
    packets: db.workPackets.filter((p) => p.projectId === project.id),
    results: db.results.filter((r) => db.workPackets.some((p) => p.id === r.workPacketId && p.projectId === project.id))
  }));
}

export async function getProjectById(projectId: string) {
  const db = await loadDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) {
    return null;
  }

  const packets = db.workPackets.filter((p) => p.projectId === projectId);
  const packetIds = new Set(packets.map((p) => p.id));
  const results = db.results.filter((r) => packetIds.has(r.workPacketId));

  return { project, packets, results };
}

export async function getWorkPackets() {
  const db = await loadDb();
  return db.workPackets.map((packet) => {
    const results = db.results.filter((result) => result.workPacketId === packet.id);
    const displayStatus = results.some((result) => result.consensusStatus === 'consensus_passed')
      ? 'fully_consensus_completed'
      : packet.status === 'queued' && results.length > 0
        ? 'awaiting_independent_validation'
        : packet.status === 'queued'
          ? 'available_to_first_pass_workers'
          : packet.status;
    return { ...packet, resultCount: results.length, displayStatus };
  });
}

export async function getResults() {
  const db = await loadDb();
  return db.results.map((result) => ({
    ...result,
    facts: db.facts.filter((f) => f.resultId === result.id),
    claims: (db.extractedClaims ?? []).filter((claim) => claim.resultId === result.id)
  }));
}

export async function getNodes() {
  return withDb((db) => listNodes(db));
}

export async function getWorkerControlConfig() {
  return withDb((db) => getWorkerControl(db));
}

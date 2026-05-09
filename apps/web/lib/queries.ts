import { getWorkerControl, listNodes, reconcileCoordinatorState } from './coordinator';
import { loadDb, withDb } from './db';

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
    activeClaimCount: db.claims.filter((claim) => claim.status === 'claimed').length,
    expiredClaimCount: db.claims.filter((claim) => claim.status === 'expired').length,
    nodeCount: db.nodes.length,
    onlineNodeCount: db.nodes.filter((node) => node.status === 'online').length,
    offlineNodeCount: db.nodes.filter((node) => node.status === 'offline').length,
    suspendedNodeCount: db.nodes.filter((node) => node.status === 'suspended').length,
    revokedNodeCount: db.nodes.filter((node) => node.status === 'revoked').length,
    resultCount: db.results.length,
    validatedCount: db.results.filter((r) => r.formatValidated ?? r.validated).length,
    failedValidationCount: db.results.filter((r) => !(r.formatValidated ?? r.validated)).length,
    workerControl: db.workerControl,
    ingestionRunCount: db.ingestionRuns.length,
    failedIngestionRunCount: db.ingestionRuns.filter((run) => run.status === 'failed' || run.status === 'partial_failed').length,
    recentIngestionRuns: db.ingestionRuns.slice(0, 5)
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
  return db.workPackets;
}

export async function getResults() {
  const db = await loadDb();
  return db.results.map((result) => ({
    ...result,
    facts: db.facts.filter((f) => f.resultId === result.id)
  }));
}

export async function getNodes() {
  return withDb((db) => listNodes(db));
}

export async function getWorkerControlConfig() {
  return withDb((db) => getWorkerControl(db));
}

import { listNodes, reconcileCoordinatorState } from './coordinator';
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
    nodeCount: db.nodes.length,
    resultCount: db.results.length,
    validatedCount: db.results.filter((r) => r.validated).length
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

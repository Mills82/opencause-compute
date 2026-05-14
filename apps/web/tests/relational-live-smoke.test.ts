import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const liveUrl = process.env.LIVE_RELATIONAL_SMOKE_URL;
const describeLive = liveUrl ? describe : describe.skip;

describeLive('non-destructive live relational submit smoke', () => {
  it('exercises submitResultRelational through extracted_claims, consensus, and Evidence Cards', async () => {
    process.env.DATABASE_URL = liveUrl;
    process.env.OPENCAUSE_RELATIONAL_STORAGE = 'true';
    process.env.OPENCAUSE_HOSTED = 'false';
    delete process.env.NODE_ENROLLMENT_CODE;
    delete process.env.NODE_ENROLLMENT_CODES;

    const suffix = randomBytes(6).toString('hex');
    const projectSlug = `relational-smoke-${suffix}`;
    const sourceUrl = `https://pmc.ncbi.nlm.nih.gov/articles/PMC-relational-live-smoke-${suffix}/`;
    const nodeAName = `rel-smoke-a-${suffix}`;
    const nodeBName = `rel-smoke-b-${suffix}`;
    const sentence = 'Radiotherapy significantly improved local control in lung cancer patients.';
    const pool = new Pool({ connectionString: liveUrl });

    try {
      const app = await import('../lib/relational-app');
      const worker = await import('../lib/relational-worker');
      const db = await import('../lib/db');
      const cards = await import('../lib/evidence-cards');

      await app.ingestSourcesRelational({
        projectSlug,
        projectName: 'Relational Smoke Project',
        projectDescription: 'Temporary relational smoke test project',
        sources: [{ title: 'PMC oncology relational smoke chunk', sourceText: sentence, sourceCitation: 'PMC relational smoke citation', sourceUrl }],
        extractor: 'local-llm-v2'
      });

      await pool.query("UPDATE work_packets SET updated_at = '1970-01-01T00:00:00Z', created_at = '1970-01-01T00:00:00Z' WHERE source_url = $1", [sourceUrl]);
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_packets WHERE status = 'queued' AND source_url = $1", [sourceUrl])).rows[0].count)).toBe(1);

      const nodeA = await app.registerNodeRelational({ nodeName: nodeAName, platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v2'] });
      const nodeB = await app.registerNodeRelational({ nodeName: nodeBName, platform: 'linux', version: '0.1.0', capabilities: ['local-llm-v2'] });

      const result = {
        schemaVersion: 'claims-v2' as const,
        claims: [{
          claimType: 'local_control' as const,
          evidenceOrigin: 'this_study_result' as const,
          evidenceType: 'clinical' as const,
          studyContext: 'human_cohort' as const,
          polarity: 'affirmed' as const,
          direction: 'increased' as const,
          cancerType: 'lung cancer',
          outcomeMention: 'local control',
          exactEvidenceSentence: sentence,
          confidence: 0.82
        }],
        summary: 'one candidate evidence record',
        warnings: []
      };

      const packetRow = (await pool.query('SELECT id FROM work_packets WHERE source_url = $1', [sourceUrl])).rows[0];
      const firstClaimRow = (await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes',NULL) RETURNING id", [packetRow.id, nodeA!.node.id])).rows[0];
      await pool.query("UPDATE work_packets SET status = 'claimed', updated_at = NOW() WHERE id = $1", [packetRow.id]);
      const firstSubmit = await worker.submitResultRelational({ nodeId: nodeA!.node.id, token: nodeA!.nodeToken, claimId: firstClaimRow.id, workPacketId: packetRow.id, extractorVersion: 'Local LLM v2', result });
      expect(firstSubmit?.claims[0]?.claimType).toBe('local_control');
      expect(firstSubmit?.record.consensusStatus).toBe('consensus_pending');
      expect(firstSubmit?.workPacket.status).toBe('queued');

      const secondClaimRow = (await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW()+INTERVAL '10 minutes',NULL) RETURNING id", [packetRow.id, nodeB!.node.id])).rows[0];
      await pool.query("UPDATE work_packets SET status = 'claimed', updated_at = NOW() WHERE id = $1", [packetRow.id]);
      const secondSubmit = await worker.submitResultRelational({ nodeId: nodeB!.node.id, token: nodeB!.nodeToken, claimId: secondClaimRow.id, workPacketId: packetRow.id, extractorVersion: 'Local LLM v2', result });
      expect(secondSubmit?.workPacket.status).toBe('completed');

      const rows = await pool.query('SELECT c.claim_type, r.consensus_status FROM extracted_claims c JOIN extraction_results r ON r.id = c.result_id JOIN work_packets p ON p.id = r.work_packet_id WHERE p.source_url = $1 ORDER BY c.id', [sourceUrl]);
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.every((row) => row.claim_type === 'local_control')).toBe(true);
      expect(rows.rows.every((row) => row.consensus_status === 'consensus_passed')).toBe(true);

      const state = await db.loadDb();
      const evidenceCards = cards.listEvidenceCards(state).filter((card) => card.source.url === sourceUrl);
      expect(evidenceCards).toHaveLength(2);
      expect(evidenceCards[0]?.claim.type).toBe('local_control');
      expect(evidenceCards[0]?.fingerprints.normalizedClaimFingerprint).toHaveLength(64);
    } finally {
      const smokeProfileIds = (await pool.query(
        'SELECT volunteer_profile_id FROM volunteer_profile_nodes WHERE node_id IN (SELECT id FROM volunteer_nodes WHERE node_name IN ($1,$2))',
        [nodeAName, nodeBName]
      )).rows.map((row) => row.volunteer_profile_id);
      await pool.query("UPDATE work_packets SET status = 'queued' WHERE status = 'smoke_hold'");
      await pool.query('DELETE FROM audit_events WHERE target_id IN (SELECT id::text FROM work_packets WHERE source_url = $1) OR actor_id IN (SELECT id::text FROM volunteer_nodes WHERE node_name IN ($2,$3))', [sourceUrl, nodeAName, nodeBName]);
      await pool.query('DELETE FROM extracted_claims WHERE result_id IN (SELECT r.id FROM extraction_results r JOIN work_packets p ON p.id = r.work_packet_id WHERE p.source_url = $1)', [sourceUrl]);
      await pool.query('DELETE FROM extraction_results WHERE work_packet_id IN (SELECT id FROM work_packets WHERE source_url = $1)', [sourceUrl]);
      await pool.query('DELETE FROM work_claims WHERE work_packet_id IN (SELECT id FROM work_packets WHERE source_url = $1) OR node_id IN (SELECT id FROM volunteer_nodes WHERE node_name IN ($2,$3))', [sourceUrl, nodeAName, nodeBName]);
      await pool.query('DELETE FROM work_packets WHERE source_url = $1', [sourceUrl]);
      await pool.query('DELETE FROM volunteer_profile_nodes WHERE node_id IN (SELECT id FROM volunteer_nodes WHERE node_name IN ($1,$2))', [nodeAName, nodeBName]);
      await pool.query('DELETE FROM volunteer_nodes WHERE node_name IN ($1,$2)', [nodeAName, nodeBName]);
      if (smokeProfileIds.length) {
        await pool.query('DELETE FROM volunteer_profiles WHERE id = ANY($1::uuid[])', [smokeProfileIds]);
      }
      await pool.query('DELETE FROM projects WHERE slug = $1', [projectSlug]);
      await pool.end();
      delete process.env.OPENCAUSE_HOSTED;
    }
  }, 30_000);
});

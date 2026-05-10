import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL ?? process.env.POSTGRES_TEST_URL;
const describePg = url ? describe : describe.skip;

async function applyMigrations(pool: Pool) {
  const migrationDir = resolve(process.cwd(), '../../db/migrations');
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(resolve(migrationDir, file), 'utf8'));
  }
}

describePg('real Postgres relational storage integration', () => {
  it('applies migrations from an empty database and preserves targeted worker data during unrelated writes', async () => {
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await applyMigrations(pool);
      await pool.query("INSERT INTO worker_control(id,paused,idle_mode,min_idle_seconds,max_cpu_percent,run_now_token,updated_at) VALUES(1,false,'user-and-cpu',120,35,0,NOW()) ON CONFLICT (id) DO NOTHING");
      const node = await pool.query("INSERT INTO volunteer_nodes(id,node_name,platform,version,status,capabilities,registered_at,last_heartbeat_at,node_token_hash) VALUES(gen_random_uuid(),'n','win32','0.1.0','online',ARRAY['local-llm-v1'],NOW(),NOW(),'hash') RETURNING id");
      const packet = await pool.query("INSERT INTO projects(id,slug,name,description,created_at) VALUES(gen_random_uuid(),'p','P','D',NOW()) RETURNING id");
      const work = await pool.query("INSERT INTO work_packets(id,project_id,title,source_text,source_citation,source_url,input_hash,extractor,signature,status,created_at,updated_at) VALUES(gen_random_uuid(),$1,'t','source','cite','https://example.com','h','local-llm-v1','sig','claimed',NOW(),NOW()) RETURNING id", [packet.rows[0].id]);
      await pool.query("INSERT INTO work_claims(id,work_packet_id,node_id,status,claimed_at,lease_expires_at,completed_at) VALUES(gen_random_uuid(),$1,$2,'claimed',NOW(),NOW() + INTERVAL '10 minutes',NULL)", [work.rows[0].id, node.rows[0].id]);
      await pool.query("INSERT INTO volunteer_enrollments(id,email,enrollment_code_hash,status,created_at,source) VALUES(gen_random_uuid(),'a@example.com','h','issued',NOW(),'public_signup')");
      await pool.query("UPDATE worker_control SET run_now_token = run_now_token + 1, updated_at = NOW() WHERE id = 1");
      expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM work_claims WHERE status = 'claimed'")).rows[0].count)).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*)::int AS count FROM volunteer_enrollments')).rows[0].count)).toBe(1);
    } finally {
      await pool.end();
    }
  });
});

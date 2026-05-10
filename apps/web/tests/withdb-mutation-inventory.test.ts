import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = resolve(webRoot, 'app/api');

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(fullPath);
    return entry.isFile() && entry.name === 'route.ts' ? [fullPath] : [];
  });
}

const allowlisted = new Set([
  // Local/dev/admin batch workflows still intentionally use DatabaseState mutations until the next storage milestone.
  'app/api/admin/reset-test-state/route.ts',
  'app/api/admin/seed-demo-data/route.ts',
  // These routes use targeted relational repositories first and withDb only as local/dev fallback.
  'app/api/admin/gamification/moderate/route.ts',
  'app/api/admin/gamification/profiles/[profileId]/route.ts',
  'app/api/admin/gamification/recompute/route.ts',
  'app/api/admin/gamification/teams/route.ts',
  'app/api/admin/gamification/teams/[teamId]/members/route.ts',
  'app/api/admin/ingest/cron/route.ts',
  'app/api/admin/ingest/pmc-oa/route.ts',
  'app/api/admin/ingest/pubmed/route.ts',
  'app/api/admin/project-progress/refresh/route.ts',
  'app/api/nodes/register/route.ts',
  'app/api/nodes/heartbeat/route.ts',
  'app/api/admin/nodes/[nodeId]/status/route.ts',
  'app/api/volunteer/enroll/route.ts',
  'app/api/volunteer/profile/route.ts',
  'app/api/admin/volunteer-enrollments/[enrollmentId]/status/route.ts',
  'app/api/report-public-content/route.ts',
  'app/api/worker/control/route.ts',
  'app/api/worker/run-now/route.ts',
  'app/api/work/claim/route.ts',
  'app/api/work/fail/route.ts',
  'app/api/work/release/route.ts',
  'app/api/work/submit/route.ts'
]);

describe('withDb mutation inventory', () => {
  it('flags production API mutations that use whole-state withDb without allowlist', () => {
    const offenders = findRouteFiles(apiRoot).filter((route) => {
      const relative = route.replace(`${webRoot}/`, '');
      const source = readFileSync(route, 'utf8');
      const mutates = /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);
      return mutates && source.includes('withDb(') && !allowlisted.has(relative);
    }).map((route) => route.replace(`${webRoot}/`, ''));
    expect(offenders).toEqual([]);
  });
});

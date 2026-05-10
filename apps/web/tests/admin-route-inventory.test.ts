import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(fullPath);
    return entry.isFile() && entry.name === 'route.ts' ? [fullPath] : [];
  });
}

describe('admin mutation route inventory', () => {
  it('requires auth and named rate limits on admin mutations', () => {
    const routes = findRouteFiles(resolve(webRoot, 'app/api/admin'));
    const offenders = routes.filter((route) => {
      if (route.endsWith('/app/api/admin/login/route.ts')) return false;
      const source = readFileSync(route, 'utf8');
      const mutates = /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);
      if (!mutates) return false;
      return !/isAdminAuthorized|isCronAuthorized/.test(source) || !/checkNamedRateLimitAsync/.test(source);
    }).map((route) => route.replace(`${webRoot}/`, ''));
    expect(offenders).toEqual([]);
  });
});

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(desktopDir, '../..');
const forbidden = ['runMockExtractorV1', 'Mock Extractor v1', 'Local LLM v1', 'local-llm-v1'];
const requiredFiles = [
  resolve(repoRoot, 'packages/shared/dist/index.js'),
  resolve(repoRoot, 'apps/worker/dist/index.js'),
  resolve(desktopDir, 'dist/electron-main.js')
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`release_smoke_missing_required_file:${file}`);
}

const scanRoots = [
  resolve(repoRoot, 'packages/shared/dist'),
  resolve(repoRoot, 'apps/worker/dist'),
  resolve(desktopDir, 'dist'),
  resolve(desktopDir, 'release/win-unpacked/resources/worker')
];

const files = scanRoots.flatMap((root) => walk(root)).filter((file) => /\.(js|mjs|cjs|json|html|txt|map)$/.test(file));
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const token of forbidden) {
    if (text.includes(token)) hits.push(`${file}: ${token}`);
  }
}
if (hits.length) {
  console.error('Forbidden stale worker symbols found in release build:');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}
console.log(`release smoke check passed (${files.length} files scanned)`);

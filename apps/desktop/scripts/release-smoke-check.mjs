import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const packagedManifest = await import(pathToFileURL(resolve(desktopDir, 'release/win-unpacked/resources/worker/dist/extractor-manifest.js')).href);
const winAppDir = 'C:\\Users\\Smoke\\.opencause-compute';
for (const child of ['worker.log', 'node.json', 'packet-failures.json']) {
  packagedManifest.assertPathInside(winAppDir, `${winAppDir}\\${child}`);
}
try {
  packagedManifest.assertPathInside(winAppDir, 'C:\\Users\\Smoke\\.opencause-compute-evil\\worker.log');
  throw new Error('release_smoke_windows_path_guard_failed');
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'unsafe_path_outside_app_dir') throw error;
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

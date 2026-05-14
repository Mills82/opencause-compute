import fs from 'node:fs';
import { readLocalLlmConfig, runLocalLlmV2Extractor } from '../dist/local-llm.js';

const evalPath = process.argv[2] ?? new URL('../evals/cancer-miner-20-packet-golden.json', import.meta.url).pathname;
const model = process.argv[3] ?? process.env.LOCAL_LLM_MODEL;
const data = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
const config = readLocalLlmConfig();
if (model) config.model = model;
const rows = [];
for (const item of data.cases) {
  const result = await runLocalLlmV2Extractor(item.sourceText, config, undefined, undefined, { title: item.title, sourceCitation: item.sourceCitation, sourceUrl: item.sourceUrl });
  const extracted = result.claims.map((claim) => claim.exactEvidenceSentence);
  const expectedPositive = item.expected?.shouldExtract === true;
  const matchedExpected = expectedPositive ? extracted.includes(item.expected.evidenceSentence) : extracted.length === 0;
  rows.push({ id: item.id, expectedPositive, claims: result.claims.length, matchedExpected, warnings: result.warnings, extracted, result });
  console.log(JSON.stringify({ id: item.id, expectedPositive, claims: result.claims.length, matchedExpected, warnings: result.warnings }));
}
const positives = rows.filter((row) => row.expectedPositive);
const negatives = rows.filter((row) => !row.expectedPositive);
const summary = {
  model: config.model,
  cases: rows.length,
  expectedPositives: positives.length,
  extractedCases: rows.filter((row) => row.claims > 0).length,
  truePositiveCases: positives.filter((row) => row.claims > 0).length,
  exactMatchedPositiveCases: positives.filter((row) => row.matchedExpected).length,
  falsePositiveCases: negatives.filter((row) => row.claims > 0).length,
  missedPositiveCases: positives.filter((row) => row.claims === 0).length,
  malformedOrRejected: rows.filter((row) => row.warnings.some((warning) => warning.startsWith('claim_rejected:') || warning.includes('missing_warnings'))).length
};
console.log(JSON.stringify({ summary }, null, 2));
fs.writeFileSync(`apps/worker/evals/cancer-miner-lite2-${config.model.replace(/[^a-z0-9_.-]+/gi, '-')}.results.json`, JSON.stringify({ summary, rows }, null, 2));

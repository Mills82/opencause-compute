#!/usr/bin/env node
import { extractionPromptV2, normalizeLocalLlmV2Payload, parseLocalLlmJson } from '../dist/local-llm.js';

const endpoint = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';
const model = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';
const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000);

const snippets = [
  {
    id: 'background-treatment-response',
    text: 'In the Phase III JAVELIN Renal 101 study, axitinib plus avelumab was associated with a significant improvement in progression-free survival (PFS) and overall response rate (ORR) in comparison to sunitinib.',
    expected: 'one low/medium-priority treatment_response claim; evidenceOrigin cited_prior_work or background; exact sentence copied'
  },
  {
    id: 'this-study-outcome-result',
    text: 'The 53% ORR, median PFS of 22.1 months and 1- and 2-year OS rates of 78% and 69% respectively amongst patients in C1 of our study are comparable with prior reports.',
    expected: 'one treatment_response or prognosis/outcome claim; evidenceOrigin this_study_result; exact sentence copied'
  },
  {
    id: 'dose-regimen-without-outcome',
    text: 'The dose regimen ranged from 50.4 to 66.6 Gy for Grade I, while 54–70.2 Gy for Grade II/III.',
    expected: 'no claim'
  },
  {
    id: 'bibliometric-cluster',
    text: 'Cluster 2 constituted the largest group with 122 papers and the highest normalized local citation score.',
    expected: 'no biomedical cancer claim'
  },
  {
    id: 'methods-eligibility',
    text: 'Patients with complete response after neoadjuvant therapy were included.',
    expected: 'no claim unless the sentence reports an outcome/finding'
  }
];

const positiveExample = [
  '',
  'Tiny example:',
  'Source sentence: In the Phase III JAVELIN Renal 101 study, axitinib plus avelumab was associated with a significant improvement in progression-free survival (PFS) and overall response rate (ORR) in comparison to sunitinib.',
  'Good output: {"schemaVersion":"claims-v2-lite","claims":[{"claimType":"treatment_response","evidenceOrigin":"cited_prior_work","evidenceType":"clinical","studyContext":"clinical_trial","polarity":"affirmed","direction":"increased","cancerType":"metastatic renal cell carcinoma","drugOrInterventionMention":"axitinib plus avelumab","outcomeMention":"progression-free survival (PFS) and overall response rate (ORR)","exactEvidenceSentence":"In the Phase III JAVELIN Renal 101 study, axitinib plus avelumab was associated with a significant improvement in progression-free survival (PFS) and overall response rate (ORR) in comparison to sunitinib.","reviewPriority":"low","confidence":0.8}],"summary":"Extracted one cited prior-work treatment-response claim.","warnings":[]}'
].join('\n');

const negativeExample = [
  '',
  'Tiny negative example:',
  'Source sentence: The dose regimen ranged from 50.4 to 66.6 Gy for Grade I, while 54–70.2 Gy for Grade II/III.',
  'Good output: {"schemaVersion":"claims-v2-lite","claims":[],"noClaimReason":"methods_only","summary":"No grounded cancer outcome claim was extracted.","warnings":[]}'
].join('\n');

const variants = [
  { id: 'current', suffix: '' },
  { id: 'plus-positive-example', suffix: positiveExample },
  { id: 'plus-positive-and-negative-examples', suffix: `${positiveExample}\n${negativeExample}` }
];

function promptFor(variant, sourceText) {
  const base = extractionPromptV2(sourceText);
  if (!variant.suffix) return base;
  return base.replace('\nSource text follows:\n', `${variant.suffix}\nSource text follows:\n`);
}

function judge(snippet, normalized) {
  const claims = normalized?.claims ?? [];
  const first = claims[0];
  if (snippet.id.includes('background-treatment')) return claims.length === 1 && first?.claimType === 'treatment_response' && ['cited_prior_work', 'background', 'review_summary'].includes(first?.evidenceOrigin) && first?.exactEvidenceSentence === snippet.text;
  if (snippet.id.includes('this-study')) return claims.length === 1 && ['treatment_response', 'prognosis'].includes(first?.claimType) && first?.evidenceOrigin === 'this_study_result' && first?.exactEvidenceSentence === snippet.text;
  return claims.length === 0;
}

async function generate(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0, num_predict: 1200 } }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`ollama_http_${response.status}`);
    const payload = await response.json();
    return String(payload.response ?? '');
  } finally {
    clearTimeout(timer);
  }
}

const report = { endpoint, model, timeoutMs, createdAt: new Date().toISOString(), variants: [] };
for (const variant of variants) {
  const variantReport = { id: variant.id, promptChars: 0, results: [], passCount: 0 };
  for (const snippet of snippets) {
    const prompt = promptFor(variant, snippet.text);
    variantReport.promptChars = prompt.length;
    const started = Date.now();
    let raw = '', parsed = null, normalized = null, error = null, passed = false;
    try {
      raw = await generate(prompt);
      parsed = parseLocalLlmJson(raw);
      normalized = normalizeLocalLlmV2Payload(parsed, snippet.text);
      passed = judge(snippet, normalized);
      if (passed) variantReport.passCount += 1;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    variantReport.results.push({ id: snippet.id, expected: snippet.expected, elapsedMs: Date.now() - started, raw, parsed, normalized, passed, error });
  }
  report.variants.push(variantReport);
}
console.log(JSON.stringify(report, null, 2));

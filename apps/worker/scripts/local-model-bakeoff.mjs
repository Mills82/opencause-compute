#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateSentencePromptV2, normalizeLocalLlmV2Payload, parseLocalLlmJson, selectCandidateEvidenceSentences } from '../dist/local-llm.js';

const endpoint = (process.env.OLLAMA_ENDPOINT ?? process.env.LOCAL_LLM_ENDPOINT ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? process.env.LOCAL_LLM_TIMEOUT_MS ?? 180000);
const outputDir = process.env.OPENCAUSE_EVAL_OUTPUT_DIR ?? './eval-results';
const useSchemaFormat = (process.env.OPENCAUSE_USE_SCHEMA_FORMAT ?? 'true') !== 'false';
const retryCount = Number(process.env.OPENCAUSE_EVAL_RETRIES ?? 1);
const repeatCount = Math.max(1, Number(process.env.OPENCAUSE_EVAL_REPEAT_COUNT ?? 1));
const modelTier = process.env.OPENCAUSE_MODEL_TIER ?? 'unknown';

const CLAIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'claims', 'summary', 'warnings'],
  properties: {
    schemaVersion: { enum: ['claims-v2-lite'] },
    claims: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claimType', 'evidenceOrigin', 'evidenceType', 'studyContext', 'polarity', 'direction', 'exactEvidenceSentence', 'confidence'],
        properties: {
          claimType: { enum: ['treatment_response', 'resistance', 'prognosis', 'risk', 'progression', 'diagnosis', 'biology', 'studied_with', 'unclear'] },
          evidenceOrigin: { enum: ['this_study_result', 'cited_prior_work', 'background', 'methods_only', 'hypothesis_or_speculation', 'review_summary', 'unclear'] },
          evidenceType: { enum: ['clinical', 'preclinical', 'computational', 'review', 'case_report', 'unclear'] },
          studyContext: { enum: ['human_cohort', 'clinical_trial', 'cell_line', 'animal', 'organoid', 'mixed', 'unclear'] },
          polarity: { enum: ['affirmed', 'negated', 'speculative', 'uncertain'] },
          direction: { enum: ['increased', 'decreased', 'associated', 'no_association', 'mixed', 'unclear'] },
          cancerType: { type: 'string' },
          biomarkerMention: { type: 'string' },
          drugOrInterventionMention: { type: 'string' },
          outcomeMention: { type: 'string' },
          statisticalEvidenceMention: { type: 'string' },
          sampleSizeMention: { type: 'string' },
          exactEvidenceSentence: { type: 'string', minLength: 1 },
          reviewPriority: { enum: ['high', 'medium', 'low'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    noClaimReason: { enum: ['no_cancer_claim', 'methods_only', 'background_only', 'insufficient_context', 'extraction_uncertain', 'other', ''] },
    summary: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } }
  }
};

const MODEL_MATRIX = [
  { tag: 'nuextract:2b', tier: 'laptop', role: 'extractor', status: 'candidate_unverified_tag', notes: 'NuExtract 2.0 2B is high-priority, but official Ollama tag must be verified or built from GGUF/Modelfile.' },
  { tag: 'nuextract:8b', tier: 'desktop', role: 'extractor', status: 'candidate_unverified_tag', notes: 'Compare against NuExtract 2B once an Ollama-compatible tag/build is verified.' },
  { tag: 'qwen3:14b', tier: 'desktop', role: 'extractor_or_adjudicator', status: 'ollama_library_likely', notes: 'Mid-tier reasoning fallback; verify exact 2507/instruct variant.' },
  { tag: 'gemma3:12b', tier: 'desktop', role: 'benchmark', status: 'ollama_library_likely', notes: 'Use QAT/GGUF variant if available; verify tag and memory.' },
  { tag: 'mistral-small3.2:24b', tier: 'high_end', role: 'adjudicator', status: 'ollama_library_likely', notes: 'High-priority claim-support adjudicator; verify exact official tag.' },
  { tag: 'gemma4:26b', tier: 'high_end', role: 'advanced_consensus_candidate', status: 'ollama_library_observed', notes: 'Retest on stronger PCs; previous laptop run was poor.' },
  { tag: 'qwen3.6:27b', tier: 'high_end', role: 'advanced_consensus_candidate', status: 'ollama_library_observed', notes: 'Verified Ollama tag; test against Qwen3 14B before promoting.' }
];

const DEFAULT_SNIPPETS = [
  {
    id: 'cited-prior-work-treatment-response',
    text: 'In the Phase III JAVELIN Renal 101 study, axitinib plus avelumab was associated with a significant improvement in progression-free survival (PFS) and overall response rate (ORR) in comparison to sunitinib.',
    expect: { kind: 'claim', origins: ['cited_prior_work', 'background', 'review_summary'], claimTypes: ['treatment_response', 'prognosis'] }
  },
  {
    id: 'this-study-orr-pfs-os',
    text: 'The 53% ORR, median PFS of 22.1 months and 1- and 2-year OS rates of 78% and 69% respectively amongst patients in C1 of our study are comparable with prior reports.',
    expect: { kind: 'claim', origins: ['this_study_result'], claimTypes: ['treatment_response', 'prognosis'] }
  },
  {
    id: 'dose-regimen-without-outcome',
    text: 'The dose regimen ranged from 50.4 to 66.6 Gy for Grade I, while 54–70.2 Gy for Grade II/III.',
    expect: { kind: 'no_claim' }
  },
  {
    id: 'methods-eligibility-complete-response-included',
    text: 'Patients with complete response after neoadjuvant therapy were included.',
    expect: { kind: 'no_claim' }
  },
  {
    id: 'toxicity-adverse-event-result',
    text: 'Grade 3 or higher treatment-related adverse events occurred in 18% of patients receiving the combination therapy.',
    context: { title: 'Combination therapy in advanced lung cancer' },
    expect: { kind: 'claim', origins: ['this_study_result', 'unclear'], claimTypes: ['treatment_response', 'unclear'] }
  },
  {
    id: 'biomarker-association',
    text: 'High PD-L1 expression was significantly associated with improved objective response rate in patients with non-small cell lung cancer treated with pembrolizumab.',
    expect: { kind: 'claim', origins: ['this_study_result', 'background', 'cited_prior_work', 'unclear'], claimTypes: ['treatment_response', 'prognosis', 'studied_with', 'unclear'] }
  },
  {
    id: 'this-study-os-hazard-ratio',
    text: 'Median overall survival was 18.4 months in the pembrolizumab group and 12.1 months in the chemotherapy group (hazard ratio for death, 0.68; P=0.002).',
    context: { title: 'Pembrolizumab versus chemotherapy in metastatic non-small cell lung cancer' },
    expect: { kind: 'claim', origins: ['this_study_result', 'unclear'], claimTypes: ['prognosis', 'treatment_response'] }
  },
  {
    id: 'this-study-biomarker-poor-os',
    text: 'KRAS mutation was independently associated with worse overall survival in patients with colorectal cancer.',
    expect: { kind: 'claim', origins: ['this_study_result', 'unclear'], claimTypes: ['prognosis'] }
  },
  {
    id: 'study-objective',
    text: 'The aim of this study was to evaluate the prognostic value of circulating tumor DNA in metastatic breast cancer.',
    expect: { kind: 'no_claim' }
  },
  {
    id: 'methods-eligible-prior-response',
    text: 'Eligible patients had achieved partial response or stable disease after induction chemotherapy.',
    context: { title: 'Maintenance treatment in metastatic colorectal cancer' },
    expect: { kind: 'no_claim' }
  },
  {
    id: 'statistical-method-only',
    text: 'Progression-free survival was estimated using the Kaplan-Meier method and compared with the log-rank test.',
    context: { title: 'Clinical trial methods in ovarian cancer' },
    expect: { kind: 'no_claim' }
  },
  {
    id: 'hypothesis-not-result',
    text: 'We hypothesized that high HER2 expression may predict sensitivity to trastuzumab in gastric cancer.',
    expect: { kind: 'no_claim' }
  },
  {
    id: 'review-summary-prior-work',
    text: 'Previous trials have shown that imatinib improves progression-free survival in gastrointestinal stromal tumors.',
    expect: { kind: 'claim', origins: ['cited_prior_work', 'background', 'review_summary'], claimTypes: ['treatment_response', 'prognosis'] }
  },
  {
    id: 'cox-model-real-result',
    text: 'In multivariable Cox analysis, high ctDNA levels independently predicted shorter progression-free survival in metastatic breast cancer.',
    expect: { kind: 'claim', origins: ['this_study_result', 'unclear'], claimTypes: ['prognosis'] }
  },
  {
    id: 'endpoint-definition-only',
    text: 'The primary endpoint was objective response rate according to RECIST version 1.1.',
    context: { title: 'Phase II trial in advanced renal cell carcinoma' },
    expect: { kind: 'no_claim' }
  },
  {
    id: 'future-trial-plan',
    text: 'A future randomized trial will evaluate whether nivolumab improves survival in patients with high-risk melanoma.',
    expect: { kind: 'no_claim' }
  }
];

function modelsFromEnv() {
  const explicit = process.env.OPENCAUSE_EVAL_MODELS ?? process.env.OLLAMA_MODEL ?? process.env.LOCAL_LLM_MODEL;
  if (explicit) return explicit.split(',').map((model) => model.trim()).filter(Boolean);
  return ['gemma4:e4b'];
}

async function ollamaTags() {
  const response = await fetch(`${endpoint}/api/tags`);
  if (!response.ok) throw new Error(`ollama_tags_http_${response.status}`);
  const payload = await response.json();
  return (payload.models ?? []).map((model) => model.name ?? model.model).filter(Boolean);
}

function promptFor(snippet) {
  const context = snippet.context ?? {};
  const contextText = [context.title, context.sectionTitle, context.sourceCitation, context.sourceUrl, context.sourcePublishedAt].filter(Boolean).join('\n');
  const candidates = selectCandidateEvidenceSentences(snippet.text, 8, contextText);
  if (candidates.length) return { prompt: candidateSentencePromptV2(candidates, context), candidateSentences: candidates };
  return { prompt: candidateSentencePromptV2([snippet.text], context), candidateSentences: [snippet.text] };
}

function judge(snippet, normalized) {
  const claims = normalized?.claims ?? [];
  const evidenceExact = claims.every((claim) => snippet.text.includes(claim.exactEvidenceSentence));
  if (!evidenceExact) return { passed: false, reason: 'evidence_span_not_exact' };
  if (snippet.expect.kind === 'no_claim') return { passed: claims.length === 0, reason: claims.length === 0 ? 'ok' : 'unexpected_claim' };
  if (claims.length !== 1) return { passed: false, reason: `expected_one_claim_got_${claims.length}` };
  const claim = claims[0];
  if (!snippet.expect.origins.includes(claim.evidenceOrigin)) return { passed: false, reason: `unexpected_origin:${claim.evidenceOrigin}` };
  if (!snippet.expect.claimTypes.includes(claim.claimType)) return { passed: false, reason: `unexpected_claim_type:${claim.claimType}` };
  return { passed: true, reason: 'ok' };
}

function classifyFailure(result) {
  if (result.passed) return null;
  if ((result.validationErrors ?? []).length) return 'parse_or_schema_error';
  if (result.judgeReason === 'evidence_span_not_exact') return 'evidence_span_not_exact';
  if (result.judgeReason?.startsWith('expected_one_claim_got_0')) return 'missed_expected_claim';
  if (result.judgeReason?.startsWith('expected_one_claim_got_')) return 'wrong_claim_count';
  if (result.judgeReason?.startsWith('unexpected_origin')) return 'wrong_origin';
  if (result.judgeReason?.startsWith('unexpected_claim_type')) return 'wrong_claim_type';
  if (result.judgeReason === 'unexpected_claim') return 'false_positive';
  return 'other';
}

async function generate(model, prompt) {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(useSchemaFormat ? { format: CLAIM_SCHEMA } : {}),
      options: { temperature: 0, top_p: 0.9, num_predict: Number(process.env.LOCAL_LLM_NUM_PREDICT ?? 1600), num_ctx: Number(process.env.LOCAL_LLM_NUM_CTX ?? 8192) }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`ollama_generate_http_${response.status}`);
  const payload = await response.json();
  return String(payload.response ?? '');
}

async function runSnippet(model, snippet) {
  const { prompt, candidateSentences } = promptFor(snippet);
  const result = { id: snippet.id, expected: snippet.expect, model, modelTier, promptVariant: 'candidate-sentence-v2-schema-2026-05-12c', promptChars: prompt.length, candidateSentences, schemaConstrained: useSchemaFormat, retryCount: 0, elapsedMs: 0, raw: '', rawChars: 0, parsed: null, normalized: null, validationErrors: [], evidenceSpanExact: false, passed: false, judgeReason: 'not_run', failureClass: null };
  const started = Date.now();
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    result.retryCount = attempt;
    try {
      result.raw = await generate(model, prompt);
      result.rawChars = result.raw.length;
      result.parsed = parseLocalLlmJson(result.raw);
      result.normalized = normalizeLocalLlmV2Payload(result.parsed, snippet.text, snippet.context ?? {});
      result.evidenceSpanExact = (result.normalized.claims ?? []).every((claim) => snippet.text.includes(claim.exactEvidenceSentence));
      const judged = judge(snippet, result.normalized);
      result.passed = judged.passed;
      result.judgeReason = judged.reason;
      break;
    } catch (error) {
      result.validationErrors.push(error instanceof Error ? error.message : String(error));
      result.judgeReason = 'error';
    }
  }
  result.failureClass = classifyFailure(result);
  result.elapsedMs = Date.now() - started;
  return result;
}

function summarizeResults(results) {
  const summary = { passCount: 0, failCount: 0, failureClasses: {}, avgElapsedMs: 0, p95ElapsedMs: 0, claimRecall: { expectedClaims: 0, extractedExpectedClaims: 0 }, falsePositiveCount: 0 };
  const elapsed = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  for (const result of results) {
    if (result.passed) summary.passCount += 1;
    else summary.failCount += 1;
    if (result.failureClass) summary.failureClasses[result.failureClass] = (summary.failureClasses[result.failureClass] ?? 0) + 1;
    if (result.expected.kind === 'claim') {
      summary.claimRecall.expectedClaims += 1;
      if ((result.normalized?.claims ?? []).length > 0) summary.claimRecall.extractedExpectedClaims += 1;
    }
    if (result.failureClass === 'false_positive') summary.falsePositiveCount += 1;
  }
  summary.avgElapsedMs = elapsed.length ? Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length) : 0;
  summary.p95ElapsedMs = elapsed.length ? elapsed[Math.min(elapsed.length - 1, Math.floor(elapsed.length * 0.95))] : 0;
  return summary;
}

async function main() {
  const selectedModels = modelsFromEnv();
  const report = { createdAt: new Date().toISOString(), endpoint, timeoutMs, modelTier, schemaConstrained: useSchemaFormat, retryCount, repeatCount, matrix: MODEL_MATRIX, selectedModels, installedModels: [], models: [] };
  try {
    report.installedModels = await ollamaTags();
  } catch (error) {
    report.ollamaError = error instanceof Error ? error.message : String(error);
  }
  for (const model of selectedModels) {
    const modelReport = { model, available: report.installedModels.includes(model), results: [], passCount: 0, failCount: 0, summary: null };
    if (!modelReport.available) {
      modelReport.error = report.ollamaError ? 'ollama_unavailable' : `model_not_installed:${model}`;
      report.models.push(modelReport);
      continue;
    }
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      for (const snippet of DEFAULT_SNIPPETS) {
        const result = await runSnippet(model, snippet);
        result.repeatIndex = repeat;
        if (result.passed) modelReport.passCount += 1;
        else modelReport.failCount += 1;
        modelReport.results.push(result);
      }
    }
    modelReport.summary = summarizeResults(modelReport.results);
    report.models.push(modelReport);
  }
  await mkdir(outputDir, { recursive: true });
  const safeModels = selectedModels.join('_').replace(/[^a-z0-9_.-]+/gi, '-');
  const outPath = join(outputDir, `local-model-bakeoff-${safeModels}-${Date.now()}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output: outPath, selectedModels, installedModels: report.installedModels, ollamaError: report.ollamaError, summary: report.models.map((model) => ({ model: model.model, available: model.available, passCount: model.passCount, failCount: model.failCount, error: model.error })) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

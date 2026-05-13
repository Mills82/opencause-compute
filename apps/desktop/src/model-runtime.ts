import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { APPROVED_LOCAL_MODELS, CANDIDATE_LOCAL_MODELS, DEFAULT_LOCAL_MODEL, approvedModel, candidateModel, type ApprovedModel, type CandidateLocalModel } from '@opencause/shared';

export type ModelRuntimeStatus = {
  runtime: 'ollama';
  available: boolean;
  selectedModel: string;
  selectedModelApproved: boolean;
  selectedModelInstalled: boolean;
  installedModels: string[];
  approvedModels: ApprovedModel[];
  candidateModels: CandidateLocalModel[];
  selectedModelCandidate: boolean;
  message: string;
};

export type ModelDownloadStatus = {
  id: string;
  model: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  stdout: string;
  stderr: string;
  lastMessage: string;
  code?: number | null;
};

const downloads = new Map<string, ModelDownloadStatus & { child?: ChildProcess }>();

function candidateOllamaCommands(): string[] {
  const candidates = ['ollama'];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const home = os.homedir();
    for (const base of [localAppData, programFiles, programFilesX86, home ? path.join(home, 'AppData', 'Local') : undefined]) {
      if (base) candidates.push(path.join(base, 'Programs', 'Ollama', 'ollama.exe'));
    }
  } else {
    candidates.push('/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama');
  }
  return [...new Set(candidates)];
}

let resolvedOllamaCommand: string | null = null;

function stripControlSequences(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r/g, '\n');
}

function compactProgressLine(line: string): string {
  return stripControlSequences(line).replace(/\s+/g, ' ').trim();
}

async function run(command: string, args: string[], timeoutMs = 10_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += stripControlSequences(chunk.toString()); });
    child.stderr.on('data', (chunk) => { stderr += stripControlSequences(chunk.toString()); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

async function ollamaCommand(): Promise<string | null> {
  if (resolvedOllamaCommand) return resolvedOllamaCommand;
  for (const candidate of candidateOllamaCommands()) {
    if (candidate !== 'ollama' && !existsSync(candidate)) continue;
    const result = await run(candidate, ['--version'], 5000);
    if (result.code === 0) {
      resolvedOllamaCommand = candidate;
      return candidate;
    }
  }
  return null;
}

export async function listInstalledOllamaModels(): Promise<string[]> {
  const command = await ollamaCommand();
  if (!command) return [];
  const result = await run(command, ['list']);
  if (result.code !== 0) return [];
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export async function modelRuntimeStatus(selectedModel = DEFAULT_LOCAL_MODEL): Promise<ModelRuntimeStatus> {
  const approved = approvedModel(selectedModel);
  const candidate = candidateModel(selectedModel);
  const command = await ollamaCommand();
  if (!command) {
    return {
      runtime: 'ollama',
      available: false,
      selectedModel,
      selectedModelApproved: Boolean(approved),
      selectedModelInstalled: false,
      installedModels: [],
      approvedModels: APPROVED_LOCAL_MODELS,
      candidateModels: CANDIDATE_LOCAL_MODELS,
      selectedModelCandidate: Boolean(candidateModel(selectedModel)),
      message: 'Ollama is not available. Install Ollama, then click Check again. If you just installed it, OpenCause will keep checking automatically.'
    };
  }

  const installed = await listInstalledOllamaModels();
  const selectedModelInstalled = installed.includes(selectedModel);
  return {
    runtime: 'ollama',
    available: true,
    selectedModel,
    selectedModelApproved: Boolean(approved),
    selectedModelInstalled,
    installedModels: installed,
    approvedModels: APPROVED_LOCAL_MODELS,
    candidateModels: CANDIDATE_LOCAL_MODELS,
    selectedModelCandidate: Boolean(candidate),
    message: selectedModelInstalled ? `${selectedModel} is installed.` : approved ? `${selectedModel} is approved but not installed yet.` : candidate ? `${selectedModel} is a candidate model. Verify locally before normal processing.` : `${selectedModel} is not approved.`
  };
}


export type ModelReadinessResult = {
  model: string;
  passed: boolean;
  status: 'passed' | 'failed' | 'slow';
  elapsedMs: number;
  cases: Array<{ id: string; passed: boolean; reason: string; elapsedMs: number; raw: string }>;
  recommendation: string;
};

const READINESS_CASES = [
  {
    id: 'positive-pfs',
    text: 'Median progression-free survival was 10.4 months with pembrolizumab and 6.2 months with chemotherapy in patients with non-small cell lung cancer.',
    expectClaim: true
  },
  {
    id: 'negative-sample-storage',
    text: 'Blood samples were collected before treatment and stored at minus 80 degrees Celsius.',
    expectClaim: false
  },
  {
    id: 'negative-eligibility-response',
    text: 'Eligible patients had achieved partial response or stable disease after induction chemotherapy.',
    expectClaim: false
  }
];

const READINESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hasClaim', 'exactEvidenceSentence', 'reason'],
  properties: {
    hasClaim: { type: 'boolean' },
    exactEvidenceSentence: { type: 'string' },
    reason: { type: 'string' }
  }
};

function extractJsonObject(value: string): any {
  try { return JSON.parse(value); } catch {}
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
  throw new Error('invalid_json');
}

async function readinessGenerate(model: string, text: string): Promise<string> {
  const prompt = [
    'You are testing whether this local model can extract conservative cancer evidence.',
    'Return JSON only with: hasClaim boolean, exactEvidenceSentence string, reason string.',
    'hasClaim is true only for a real cancer research result/outcome claim. Methods, eligibility, sample handling, and study objectives are not claims.',
    'If hasClaim is true, exactEvidenceSentence must exactly equal the input sentence. If false, exactEvidenceSentence must be an empty string.',
    `Input sentence: ${text}`
  ].join('\n');
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, format: READINESS_SCHEMA, options: { temperature: 0, num_ctx: 4096, num_predict: 300 } }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`ollama_http_${response.status}`);
  const payload = await response.json();
  return String(payload.response ?? '');
}

export async function testOllamaModelReadiness(model: string): Promise<ModelReadinessResult> {
  const approved = approvedModel(model);
  const candidate = candidateModel(model);
  if (!approved && !candidate) throw new Error(`model_not_approved:${model}`);
  const installed = await listInstalledOllamaModels();
  if (!installed.includes(model)) throw new Error(`model_not_installed:${model}`);
  const started = Date.now();
  const cases: ModelReadinessResult['cases'] = [];
  for (const testCase of READINESS_CASES) {
    const caseStarted = Date.now();
    try {
      const raw = await readinessGenerate(model, testCase.text);
      const parsed = extractJsonObject(raw);
      const hasClaim = parsed.hasClaim === true;
      const exact = typeof parsed.exactEvidenceSentence === 'string' ? parsed.exactEvidenceSentence : '';
      const passed = testCase.expectClaim ? hasClaim && exact === testCase.text : !hasClaim && exact === '';
      cases.push({ id: testCase.id, passed, reason: passed ? 'ok' : `unexpected_output:${JSON.stringify(parsed).slice(0, 300)}`, elapsedMs: Date.now() - caseStarted, raw });
    } catch (error) {
      cases.push({ id: testCase.id, passed: false, reason: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - caseStarted, raw: '' });
    }
  }
  const elapsedMs = Date.now() - started;
  const passed = cases.every((entry) => entry.passed);
  const slow = passed && elapsedMs > 180_000;
  return {
    model,
    passed,
    status: passed ? (slow ? 'slow' : 'passed') : 'failed',
    elapsedMs,
    cases,
    recommendation: passed
      ? slow ? `${model} works, but it was slow. Use it if this machine is otherwise idle, or switch to qwen3:14b.` : `${model} passed the readiness test.`
      : `${model} did not pass readiness on this machine. Use qwen3:14b; if that fails, manually choose gemma4:e4b as the lower-resource option.`
  };
}

export async function pullOllamaModel(model: string, allowAdvanced = false): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const approved = approvedModel(model);
  const candidate = candidateModel(model);
  if (!approved && !candidate) throw new Error(`model_not_approved:${model}`);
  if (candidate && !allowAdvanced) throw new Error(`candidate_model_requires_advanced_confirmation:${model}`);
  if (approved?.tier === 'large' && !allowAdvanced) throw new Error(`large_model_requires_advanced_confirmation:${model}`);
  if (approved?.tier === 'experimental' && !allowAdvanced) throw new Error(`experimental_model_requires_advanced_confirmation:${model}`);
  const command = await ollamaCommand();
  if (!command) throw new Error('ollama_not_available');
  return run(command, ['pull', model], 30 * 60_000);
}

export async function removeOllamaModel(model: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const installed = await listInstalledOllamaModels();
  if (!installed.includes(model)) throw new Error(`model_not_installed:${model}`);
  const command = await ollamaCommand();
  if (!command) throw new Error('ollama_not_available');
  return run(command, ['rm', model], 5 * 60_000);
}

function trimLog(value: string, maxLength = 12_000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function lastNonEmptyLine(value: string): string {
  return value.split(/\n/).map(compactProgressLine).filter(Boolean).at(-1) ?? '';
}

export async function startOllamaModelDownload(model: string, allowAdvanced = false): Promise<ModelDownloadStatus> {
  const approved = approvedModel(model);
  const candidate = candidateModel(model);
  if (!approved && !candidate) throw new Error(`model_not_approved:${model}`);
  if (candidate && !allowAdvanced) throw new Error(`candidate_model_requires_advanced_confirmation:${model}`);
  if (approved?.tier === 'large' && !allowAdvanced) throw new Error(`large_model_requires_advanced_confirmation:${model}`);
  if (approved?.tier === 'experimental' && !allowAdvanced) throw new Error(`experimental_model_requires_advanced_confirmation:${model}`);

  const existing = [...downloads.values()].find((download) => download.model === model && download.status === 'running');
  if (existing) return publicDownloadStatus(existing);

  const command = await ollamaCommand();
  if (!command) throw new Error('ollama_not_available');

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const status: ModelDownloadStatus & { child?: ChildProcess } = {
    id,
    model,
    status: 'running',
    startedAt: new Date().toISOString(),
    stdout: '',
    stderr: '',
    lastMessage: `Starting download for ${model}...`
  };
  downloads.set(id, status);

  const child = spawn(command, ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] });
  status.child = child;
  child.stdout.on('data', (chunk) => {
    status.stdout = trimLog(status.stdout + stripControlSequences(chunk.toString()));
    status.lastMessage = lastNonEmptyLine(status.stdout) || status.lastMessage;
  });
  child.stderr.on('data', (chunk) => {
    status.stderr = trimLog(status.stderr + stripControlSequences(chunk.toString()));
    status.lastMessage = lastNonEmptyLine(status.stderr) || status.lastMessage;
  });
  child.on('close', (code) => {
    status.code = code;
    status.status = code === 0 ? 'succeeded' : 'failed';
    status.finishedAt = new Date().toISOString();
    status.lastMessage = code === 0 ? `${model} installed.` : (status.lastMessage || `Download failed with code ${code}.`);
    delete status.child;
  });
  child.on('error', (error) => {
    status.code = 1;
    status.status = 'failed';
    status.finishedAt = new Date().toISOString();
    status.stderr = trimLog(status.stderr + error.message);
    status.lastMessage = error.message;
    delete status.child;
  });

  return publicDownloadStatus(status);
}

function publicDownloadStatus(status: ModelDownloadStatus & { child?: ChildProcess }): ModelDownloadStatus {
  const { child: _child, ...publicStatus } = status;
  return publicStatus;
}

export function modelDownloadStatus(id: string): ModelDownloadStatus | null {
  const status = downloads.get(id);
  return status ? publicDownloadStatus(status) : null;
}

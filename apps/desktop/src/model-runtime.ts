import { spawn, type ChildProcess } from 'node:child_process';
import { APPROVED_LOCAL_MODELS, DEFAULT_LOCAL_MODEL, approvedModel, type ApprovedModel } from '@opencause/shared';

export type ModelRuntimeStatus = {
  runtime: 'ollama';
  available: boolean;
  selectedModel: string;
  selectedModelApproved: boolean;
  selectedModelInstalled: boolean;
  approvedModels: ApprovedModel[];
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

function run(command: string, args: string[], timeoutMs = 10_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
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

export async function listInstalledOllamaModels(): Promise<string[]> {
  const result = await run('ollama', ['list']);
  if (result.code !== 0) return [];
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export async function modelRuntimeStatus(selectedModel = DEFAULT_LOCAL_MODEL): Promise<ModelRuntimeStatus> {
  const approved = approvedModel(selectedModel);
  const version = await run('ollama', ['--version']);
  if (version.code !== 0) {
    return {
      runtime: 'ollama',
      available: false,
      selectedModel,
      selectedModelApproved: Boolean(approved),
      selectedModelInstalled: false,
      approvedModels: APPROVED_LOCAL_MODELS,
      message: 'Ollama is not available. Install Ollama before starting the worker.'
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
    approvedModels: APPROVED_LOCAL_MODELS,
    message: selectedModelInstalled ? `${selectedModel} is installed.` : `${selectedModel} is approved but not installed yet.`
  };
}

export function pullOllamaModel(model: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const approved = approvedModel(model);
  if (!approved) throw new Error(`model_not_approved:${model}`);
  if (approved.tier === 'large') throw new Error(`large_model_requires_advanced_confirmation:${model}`);
  if (approved.tier === 'experimental') throw new Error(`experimental_model_requires_advanced_confirmation:${model}`);
  return run('ollama', ['pull', model], 30 * 60_000);
}

function trimLog(value: string, maxLength = 12_000): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function lastNonEmptyLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
}

export function startOllamaModelDownload(model: string): ModelDownloadStatus {
  const approved = approvedModel(model);
  if (!approved) throw new Error(`model_not_approved:${model}`);
  if (approved.tier === 'large') throw new Error(`large_model_requires_advanced_confirmation:${model}`);
  if (approved.tier === 'experimental') throw new Error(`experimental_model_requires_advanced_confirmation:${model}`);

  const existing = [...downloads.values()].find((download) => download.model === model && download.status === 'running');
  if (existing) return publicDownloadStatus(existing);

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

  const child = spawn('ollama', ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] });
  status.child = child;
  child.stdout.on('data', (chunk) => {
    status.stdout = trimLog(status.stdout + chunk.toString());
    status.lastMessage = lastNonEmptyLine(status.stdout) || status.lastMessage;
  });
  child.stderr.on('data', (chunk) => {
    status.stderr = trimLog(status.stderr + chunk.toString());
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

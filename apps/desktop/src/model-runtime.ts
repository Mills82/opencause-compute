import { spawn } from 'node:child_process';
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

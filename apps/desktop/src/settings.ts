import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_LOCAL_MODEL, APPROVED_LOCAL_MODELS } from '@opencause/shared';

export type DesktopSettings = {
  coordinatorUrl: string;
  enrollmentCode?: string;
  nodeId?: string;
  nodeToken?: string;
  localPaused: boolean;
  startupOnLogin: boolean;
  resourceControls: {
    idleMode: 'user-and-cpu' | 'cpu-only';
    minIdleSeconds: number;
    maxCpuPercent: number;
    runOnBattery: boolean;
    schedule: 'always' | 'idle-only' | 'manual';
  };
  modelRuntime: {
    extractorMode: 'local-llm';
    provider: 'ollama';
    endpointType: 'localhost' | 'remote-http' | 'other';
    model: string;
    qualityMode: 'balanced' | 'high' | 'custom';
    numCtx?: number;
    numPredict?: number;
    approvedModels: typeof APPROVED_LOCAL_MODELS;
  };
};

export const defaultDesktopSettings: DesktopSettings = {
  coordinatorUrl: 'https://opencause.appassist.ai',
  localPaused: false,
  startupOnLogin: false,
  resourceControls: {
    idleMode: 'user-and-cpu',
    minIdleSeconds: 120,
    maxCpuPercent: 35,
    runOnBattery: false,
    schedule: 'idle-only'
  },
  modelRuntime: {
    extractorMode: 'local-llm',
    provider: 'ollama',
    endpointType: 'localhost',
    model: DEFAULT_LOCAL_MODEL,
    qualityMode: 'high',
    numCtx: 8192,
    numPredict: 1200,
    approvedModels: APPROVED_LOCAL_MODELS
  }
};

export function settingsPath(appDir: string): string {
  return path.join(appDir, 'desktop-settings.json');
}

export function redactedSettings(settings: DesktopSettings) {
  return {
    ...settings,
    enrollmentCode: settings.enrollmentCode ? '[redacted]' : undefined,
    nodeToken: settings.nodeToken ? '[redacted]' : undefined
  };
}

export async function loadDesktopSettings(appDir: string): Promise<DesktopSettings> {
  const file = settingsPath(appDir);
  const raw = await readFile(file, 'utf8').catch(() => null);
  if (!raw) return { ...defaultDesktopSettings };
  const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
  return {
    ...defaultDesktopSettings,
    ...parsed,
    resourceControls: { ...defaultDesktopSettings.resourceControls, ...parsed.resourceControls },
    modelRuntime: { ...defaultDesktopSettings.modelRuntime, ...parsed.modelRuntime }
  };
}

export async function saveDesktopSettings(appDir: string, settings: DesktopSettings): Promise<void> {
  await mkdir(appDir, { recursive: true });
  await writeFile(settingsPath(appDir), JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function updateDesktopSettings(
  appDir: string,
  update: Partial<DesktopSettings> & {
    resourceControls?: Partial<DesktopSettings['resourceControls']>;
    modelRuntime?: Partial<DesktopSettings['modelRuntime']>;
  }
): Promise<DesktopSettings> {
  const current = await loadDesktopSettings(appDir);
  const next: DesktopSettings = {
    ...current,
    ...update,
    resourceControls: { ...current.resourceControls, ...update.resourceControls },
    modelRuntime: { ...current.modelRuntime, ...update.modelRuntime }
  };
  await saveDesktopSettings(appDir, next);
  return next;
}

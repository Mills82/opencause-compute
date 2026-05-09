export { WorkerSupervisor, type WorkerCommand, type WorkerRuntimeStatus, type WorkerSupervisorConfig } from './supervisor.js';
export {
  defaultDesktopSettings,
  loadDesktopSettings,
  redactedSettings,
  saveDesktopSettings,
  settingsPath,
  updateDesktopSettings,
  type DesktopSettings
} from './settings.js';
export {
  buildDesktopViewModel,
  publicLaunchUiReady,
  type DesktopAction,
  type DesktopViewModelInput,
  type ScreenViewModel
} from './view-model.js';
export {
  listInstalledOllamaModels,
  modelRuntimeStatus,
  pullOllamaModel,
  type ModelRuntimeStatus
} from './model-runtime.js';

export type DesktopScreenId =
  | 'welcome'
  | 'enrollment'
  | 'runtime-check'
  | 'activity'
  | 'resource-controls'
  | 'pause-resume'
  | 'uninstall-help';

export type DesktopScreen = {
  id: DesktopScreenId;
  title: string;
  purpose: string;
  publicLaunchRequired: boolean;
};

export const desktopScreens: DesktopScreen[] = [
  {
    id: 'welcome',
    title: 'Welcome and science disclaimer',
    purpose: 'Explain AI-assisted open science, no medical advice, volunteer resource use, and private/public beta status.',
    publicLaunchRequired: true
  },
  {
    id: 'enrollment',
    title: 'Volunteer enrollment',
    purpose: 'Accept or fetch a one-time enrollment code and register the local worker node.',
    publicLaunchRequired: true
  },
  {
    id: 'runtime-check',
    title: 'Local model/runtime check',
    purpose: 'Verify approved local LLM runtime availability without exposing local endpoint secrets.',
    publicLaunchRequired: true
  },
  {
    id: 'activity',
    title: 'Activity log',
    purpose: 'Show heartbeat, paused, idle-blocked, claimed, verified, submitted, and error states.',
    publicLaunchRequired: true
  },
  {
    id: 'resource-controls',
    title: 'Resource controls',
    purpose: 'Let volunteers configure CPU, idle, schedule, battery/AC, and future GPU controls.',
    publicLaunchRequired: true
  },
  {
    id: 'pause-resume',
    title: 'Pause and resume',
    purpose: 'One-click local pause/resume with coordinator control awareness.',
    publicLaunchRequired: true
  },
  {
    id: 'uninstall-help',
    title: 'Uninstall and data removal',
    purpose: 'Remove local credentials/logs and explain model/runtime cleanup.',
    publicLaunchRequired: true
  }
];

export type PackagingTarget = {
  platform: 'windows' | 'macos' | 'linux';
  artifact: string;
  signingRequired: boolean;
  status: 'planned' | 'blocked' | 'ready';
  notes: string;
};

export const packagingTargets: PackagingTarget[] = [
  {
    platform: 'windows',
    artifact: 'signed installer (.msi or .exe)',
    signingRequired: true,
    status: 'planned',
    notes: 'First public target. Must bundle worker runtime so ordinary volunteers do not install Node/npm manually.'
  },
  {
    platform: 'macos',
    artifact: 'signed/notarized app bundle',
    signingRequired: true,
    status: 'blocked',
    notes: 'Requires Apple developer signing/notarization path before public release.'
  },
  {
    platform: 'linux',
    artifact: 'AppImage/deb/rpm plan',
    signingRequired: false,
    status: 'planned',
    notes: 'Can follow Windows once desktop shell and worker supervisor are stable.'
  }
];

export function publicLaunchDesktopReady(): boolean {
  return desktopScreens.every((screen) => screen.publicLaunchRequired) && packagingTargets.some((target) => target.platform === 'windows' && target.status === 'ready');
}

export function packagePlan() {
  return {
    ready: publicLaunchDesktopReady(),
    screens: desktopScreens,
    targets: packagingTargets,
    next: 'Implement the Windows desktop shell UI around the worker supervisor, then add signing/installer automation.'
  };
}

if (process.argv[2] === 'package-plan') {
  process.stdout.write(`${JSON.stringify(packagePlan(), null, 2)}\n`);
}

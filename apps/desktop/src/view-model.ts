import type { DesktopSettings } from './settings.js';
import type { WorkerRuntimeStatus } from './supervisor.js';

export type DesktopAction =
  | 'accept-disclaimer'
  | 'request-enrollment'
  | 'register-worker'
  | 'check-runtime'
  | 'start-worker'
  | 'pause-worker'
  | 'resume-worker'
  | 'save-resource-controls'
  | 'tail-log'
  | 'uninstall-local-state';

export type ScreenViewModel = {
  id: string;
  title: string;
  status: 'ready' | 'blocked' | 'warning';
  message: string;
  actions: DesktopAction[];
};

export type DesktopViewModelInput = {
  settings: DesktopSettings;
  runtime: WorkerRuntimeStatus;
  disclaimerAccepted: boolean;
  runtimeAvailable: boolean;
  publicEnrollmentEnabled: boolean;
};

export function buildDesktopViewModel(input: DesktopViewModelInput): ScreenViewModel[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome',
      status: input.disclaimerAccepted ? 'ready' : 'blocked',
      message: input.disclaimerAccepted
        ? 'Science disclaimer accepted.'
        : 'Review AI-assisted open science, resource-use, and no-medical-advice disclaimers before contributing.',
      actions: input.disclaimerAccepted ? [] : ['accept-disclaimer']
    },
    {
      id: 'enrollment',
      title: 'Volunteer enrollment',
      status: input.settings.nodeId ? 'ready' : input.publicEnrollmentEnabled ? 'warning' : 'blocked',
      message: input.settings.nodeId
        ? 'Worker is registered.'
        : input.publicEnrollmentEnabled
          ? 'Request or enter a one-time enrollment code to register this worker.'
          : 'Public enrollment is currently disabled.',
      actions: input.settings.nodeId ? [] : ['request-enrollment', 'register-worker']
    },
    {
      id: 'runtime-check',
      title: 'Runtime check',
      status: input.runtimeAvailable ? 'ready' : 'blocked',
      message: input.runtimeAvailable
        ? `${input.settings.modelRuntime.provider} runtime is available.`
        : 'Local model runtime is not available yet.',
      actions: ['check-runtime']
    },
    {
      id: 'activity',
      title: 'Activity',
      status: input.runtime.running ? 'ready' : 'warning',
      message: input.runtime.running ? `Worker running with pid ${input.runtime.pid}.` : 'Worker is not running.',
      actions: input.runtime.running ? ['tail-log'] : ['start-worker', 'tail-log']
    },
    {
      id: 'pause-resume',
      title: 'Pause / resume',
      status: input.settings.localPaused ? 'warning' : 'ready',
      message: input.settings.localPaused ? 'Local worker pause is enabled.' : 'Worker is allowed to run subject to idle/resource controls.',
      actions: input.settings.localPaused ? ['resume-worker'] : ['pause-worker']
    },
    {
      id: 'resource-controls',
      title: 'Resource controls',
      status: input.settings.resourceControls.runOnBattery ? 'warning' : 'ready',
      message: `Schedule: ${input.settings.resourceControls.schedule}; max CPU: ${input.settings.resourceControls.maxCpuPercent}%.`,
      actions: ['save-resource-controls']
    },
    {
      id: 'uninstall-help',
      title: 'Uninstall / data removal',
      status: 'warning',
      message: 'Remove local worker credentials/logs and explain model/runtime cleanup.',
      actions: ['uninstall-local-state']
    }
  ];
}

export function publicLaunchUiReady(viewModel: ScreenViewModel[]): boolean {
  return viewModel.every((screen) => screen.status !== 'blocked');
}

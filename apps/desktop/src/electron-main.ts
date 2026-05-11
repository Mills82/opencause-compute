import { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, dialog, type BrowserWindow as BrowserWindowType, type MenuItemConstructorOptions, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopViewModel } from './view-model.js';
import { loadDesktopSettings, redactedSettings, updateDesktopSettings, type DesktopSettings } from './settings.js';
import { WorkerSupervisor } from './supervisor.js';
import { modelDownloadStatus, modelRuntimeStatus, pullOllamaModel, startOllamaModelDownload } from './model-runtime.js';
import { recommendedModelConfig, resourceStatus } from './host-metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(app.getPath('userData'), 'opencause-worker');

function resolveWorkerEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'worker', 'dist', 'index.js');
  }
  return path.resolve(__dirname, '../../worker/dist/index.js');
}

function resolveStaticIndex(): string {
  return path.join(__dirname, 'static', 'index.html');
}

const workerEntry = resolveWorkerEntry();
let cachedSupervisor: WorkerSupervisor | null = null;
let cachedSupervisorKey = '';
let mainWindow: BrowserWindowType | null = null;
let tray: Tray | null = null;
const loginLaunchArg = '--opencause-open-at-login';
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

function assertTrustedIpc(event: IpcMainInvokeEvent) {
  if (mainWindow && event.sender.id !== mainWindow.webContents.id) throw new Error('untrusted_ipc_sender');
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith('file://') || !url.endsWith('/index.html')) throw new Error('untrusted_ipc_origin');
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_payload');
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`invalid_${field}`);
  return value;
}

function optionalNumber(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`invalid_${field}`);
  return Math.round(value);
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`invalid_${field}`);
  return value as T;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function validateSettingsUpdate(update: unknown): Partial<DesktopSettings> {
  assertPlainObject(update);
  const allowed = new Set(['coordinatorUrl', 'localPaused', 'startupOnLogin', 'autoStartWorker', 'setupCompletedAt', 'resourceControls', 'modelRuntime']);
  for (const key of Object.keys(update)) if (!allowed.has(key)) throw new Error(`unknown_setting_${key}`);
  const next: Partial<DesktopSettings> = {};
  if (update.coordinatorUrl !== undefined) {
    if (typeof update.coordinatorUrl !== 'string') throw new Error('invalid_coordinatorUrl');
    const url = new URL(update.coordinatorUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('invalid_coordinatorUrl');
    const normalized = url.toString().replace(/\/$/, '');
    const allowCustom = process.env.OPENCAUSE_DESKTOP_ALLOW_CUSTOM_COORDINATOR === 'true' || !app.isPackaged;
    if (!allowCustom && normalized !== 'https://opencause.appassist.ai') throw new Error('custom_coordinator_disabled');
    next.coordinatorUrl = normalized;
  }
  next.localPaused = optionalBoolean(update.localPaused, 'localPaused');
  next.startupOnLogin = optionalBoolean(update.startupOnLogin, 'startupOnLogin');
  next.autoStartWorker = optionalBoolean(update.autoStartWorker, 'autoStartWorker');
  if (update.setupCompletedAt !== undefined) {
    if (typeof update.setupCompletedAt !== 'string' || Number.isNaN(Date.parse(update.setupCompletedAt))) throw new Error('invalid_setupCompletedAt');
    next.setupCompletedAt = update.setupCompletedAt;
  }
  if (update.resourceControls !== undefined) {
    assertPlainObject(update.resourceControls);
    next.resourceControls = withoutUndefined({
      idleMode: optionalEnum(update.resourceControls.idleMode, 'idleMode', ['user-and-cpu', 'cpu-only']) ?? undefined,
      minIdleSeconds: optionalNumber(update.resourceControls.minIdleSeconds, 'minIdleSeconds', 0, 86_400),
      maxCpuPercent: optionalNumber(update.resourceControls.maxCpuPercent, 'maxCpuPercent', 1, 100),
      runOnBattery: optionalBoolean(update.resourceControls.runOnBattery, 'runOnBattery'),
      schedule: optionalEnum(update.resourceControls.schedule, 'schedule', ['always', 'idle-only', 'manual']) ?? undefined
    }) as Partial<DesktopSettings['resourceControls']> as DesktopSettings['resourceControls'];
  }
  if (update.modelRuntime !== undefined) {
    assertPlainObject(update.modelRuntime);
    const model = update.modelRuntime.model === undefined ? undefined : validateModelName(update.modelRuntime.model);
    next.modelRuntime = withoutUndefined({
      model,
      qualityMode: optionalEnum(update.modelRuntime.qualityMode, 'qualityMode', ['budget', 'balanced', 'high', 'ultra', 'custom']),
      numCtx: optionalNumber(update.modelRuntime.numCtx, 'numCtx', 1024, 131_072),
      numPredict: optionalNumber(update.modelRuntime.numPredict, 'numPredict', 128, 16_384)
    }) as Partial<DesktopSettings['modelRuntime']> as DesktopSettings['modelRuntime'];
  }
  return next;
}

function validateEnrollmentCode(value: unknown): string {
  if (typeof value !== 'string') throw new Error('enrollment_code_required');
  const code = value.trim();
  if (code.length < 8 || code.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(code)) throw new Error('enrollment_code_required');
  return code;
}

function validateModelName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('model_required');
  const model = value.trim();
  if (model.length < 2 || model.length > 120 || !/^[A-Za-z0-9._:/-]+$/.test(model)) throw new Error('model_required');
  return model;
}

function validateDownloadId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{4,160}$/.test(value)) throw new Error('download_id_required');
  return value;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] ?? 0) > (right[i] ?? 0)) return 1;
    if ((left[i] ?? 0) < (right[i] ?? 0)) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  const response = await fetch('https://api.github.com/repos/Mills82/opencause-compute/releases/latest', { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'OpenCause-Compute-Desktop' } });
  if (!response.ok) throw new Error(`update_check_failed:${response.status}`);
  const release = await response.json() as { tag_name?: string; html_url?: string; name?: string; body?: string };
  const latestVersion = (release.tag_name ?? '').replace(/^v/, '');
  const currentVersion = app.getVersion();
  return { currentVersion, latestVersion, updateAvailable: Boolean(latestVersion) && compareVersions(latestVersion, currentVersion) > 0, releaseUrl: release.html_url, releaseName: release.name ?? release.tag_name, notes: (release.body ?? '').slice(0, 500) };
}

function validateExternalUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['opencause.appassist.ai', 'appassist.ai', 'github.com', 'ollama.com'].includes(url.hostname)) throw new Error('invalid_url');
  return url.toString();
}

function validateUninstallConfirmation(value: unknown): { confirmed: true } {
  assertPlainObject(value);
  if (value.confirmed !== true) throw new Error('confirmation_required');
  return { confirmed: true };
}

function isLoginStartupLaunch(): boolean {
  const loginItem = app.getLoginItemSettings();
  return process.argv.includes(loginLaunchArg) || Boolean(loginItem.wasOpenedAtLogin || loginItem.wasOpenedAsHidden);
}

function showMainWindow(maximize = false) {
  if (!mainWindow) return;
  mainWindow.show();
  if (maximize) mainWindow.maximize();
  mainWindow.focus();
}

function setDashboardSize() {
  mainWindow?.setContentSize(1120, 780);
}

function installApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Show Dashboard', accelerator: 'CmdOrCtrl+1', click: () => showMainWindow(true) },
        { label: 'Refresh Status', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: 'Hide to Tray', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.hide() },
        { label: 'Quit OpenCause Compute', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Fit Dashboard', accelerator: 'CmdOrCtrl+0', click: setDashboardSize },
        { label: 'Reload', accelerator: 'F5', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Show OpenCause Compute', click: () => showMainWindow(true) },
        { label: 'Fit to Dashboard', click: setDashboardSize },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'OpenCause Compute Website', click: () => shell.openExternal('https://opencause.appassist.ai') },
        { label: 'Download / Setup Help', click: () => shell.openExternal('https://opencause.appassist.ai/download') },
        { label: 'Science Disclaimer', click: () => shell.openExternal('https://opencause.appassist.ai/science-disclaimer') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function ensureTray(win: BrowserWindowType) {
  if (tray) return;
  const iconPath = path.join(__dirname, 'static', 'assets', 'icon.png');
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('OpenCause Compute Worker');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show OpenCause Compute', click: () => showMainWindow(true) },
    { label: 'Quit', click: () => { app.quit(); } }
  ]));
  tray.on('click', () => showMainWindow(true));
}

async function createWindow() {
  const settings = await loadDesktopSettings(appDir);
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: 'OpenCause Compute Worker',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = win;
  installApplicationMenu();
  ensureTray(win);
  win.on('close', (event) => {
    if (!(app as typeof app & { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  await win.loadFile(resolveStaticIndex());
  const startHidden = settings.startupOnLogin && isLoginStartupLaunch();
  if (startHidden) {
    win.hide();
  } else {
    win.maximize();
  }
  if (settings.autoStartWorker && settings.resourceControls.schedule !== 'manual') {
    void updateDesktopSettings(appDir, { localPaused: false }).then(() => supervisor()).then((sup) => sup.startLoop());
  }
}

async function supervisor() {
  const settings = await loadDesktopSettings(appDir);
  const key = JSON.stringify({
    coordinatorUrl: settings.coordinatorUrl,
    enrollmentCode: settings.enrollmentCode,
    nodeId: settings.nodeId,
    nodeToken: settings.nodeToken,
    resourceControls: settings.resourceControls,
    modelRuntime: settings.modelRuntime
  });
  if (cachedSupervisor && cachedSupervisorKey === key) return cachedSupervisor;
  cachedSupervisorKey = key;
  cachedSupervisor = new WorkerSupervisor({
    workerEntry,
    appDir,
    coordinatorUrl: settings.coordinatorUrl,
    enrollmentCode: settings.enrollmentCode,
    nodeId: settings.nodeId,
    nodeToken: settings.nodeToken,
    resourceControls: settings.resourceControls,
    modelRuntime: settings.modelRuntime
  });
  return cachedSupervisor;
}

ipcMain.handle('desktop:get-state', async (event) => {
  assertTrustedIpc(event);
  const settings = await loadDesktopSettings(appDir);
  const sup = await supervisor();
  const runtime = sup.status();
  const rawActivity = await sup.activitySummary();
  const activity = !runtime.running && (rawActivity.state === 'running_model' || rawActivity.state === 'heartbeat')
    ? { state: 'unknown' as const, headline: 'Worker is not running', detail: runtime.lastMode === 'run-once' ? 'The last one-shot run finished. Start the worker or run one packet now to check for new work.' : 'Start the worker to begin checking for packets.', severity: 'warning' as const, at: runtime.lastExitedAt }
    : rawActivity;
  const timeline = runtime.running ? await sup.activityTimeline() : [];
  const credentials = await sup.readCredentials();
  const modelRuntime = await modelRuntimeStatus(settings.modelRuntime.model);
  const resources = await resourceStatus(settings);
  const modelRecommendation = recommendedModelConfig(settings);
  return {
    settings: redactedSettings(settings),
    runtime,
    activity,
    timeline,
    preflight: {
      eligible: Boolean(modelRuntime.available && modelRuntime.selectedModelInstalled && resources.eligible && !settings.localPaused),
      reason: !modelRuntime.available ? 'Ollama is not installed or not reachable.' : !modelRuntime.selectedModelInstalled ? `${settings.modelRuntime.model} is not downloaded yet.` : settings.localPaused ? 'Worker is paused.' : resources.eligible ? 'Machine is eligible to contribute now.' : resources.reason,
      checks: { ollama: modelRuntime.available, modelInstalled: modelRuntime.selectedModelInstalled, resources: resources.eligible, paused: settings.localPaused }
    },
    profileSetupUrl: credentials?.profileSetupUrl,
    modelRuntime,
    resources,
    modelRecommendation,
    viewModel: buildDesktopViewModel({
      settings,
      runtime,
      disclaimerAccepted: false,
      runtimeAvailable: modelRuntime.available && modelRuntime.selectedModelInstalled,
      publicEnrollmentEnabled: false
    }),
    appVersion: app.getVersion()
  };
});

ipcMain.handle('desktop:update-settings', async (event, update: unknown) => {
  assertTrustedIpc(event);
  const previousSupervisor = cachedSupervisor;
  const settings = await updateDesktopSettings(appDir, validateSettingsUpdate(update));
  previousSupervisor?.stop();
  cachedSupervisor = null;
  cachedSupervisorKey = '';
  app.setLoginItemSettings({ openAtLogin: settings.startupOnLogin, openAsHidden: settings.startupOnLogin, args: settings.startupOnLogin ? [loginLaunchArg] : [] });
  return redactedSettings(settings);
});

ipcMain.handle('desktop:start-worker', async (event) => {
  assertTrustedIpc(event);
  const settings = await updateDesktopSettings(appDir, { localPaused: false });
  if (settings.resourceControls.schedule === 'manual') {
    return (await supervisor()).status();
  }
  return (await supervisor()).startLoop();
});
ipcMain.handle('desktop:run-now', async (event) => {
  assertTrustedIpc(event);
  await updateDesktopSettings(appDir, { localPaused: false });
  return (await supervisor()).startLoop({ forceNow: true });
});
ipcMain.handle('desktop:pause-worker', async (event) => {
  assertTrustedIpc(event);
  await updateDesktopSettings(appDir, { localPaused: true });
  return (await supervisor()).stop();
});
ipcMain.handle('desktop:stop-worker', async (event) => { assertTrustedIpc(event); return (await supervisor()).stop(); });
ipcMain.handle('desktop:uninstall-local-state', async (event, confirmation: unknown) => {
  assertTrustedIpc(event);
  validateUninstallConfirmation(confirmation);
  const options = { type: 'warning' as const, buttons: ['Cancel', 'Remove local OpenCause data'], defaultId: 0, cancelId: 0, title: 'Remove local OpenCause data?', message: 'This will remove local OpenCause Compute credentials, settings, and logs from this computer.', detail: 'Downloaded model files managed by Ollama are not removed.' };
  const response = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  if (response.response !== 1) throw new Error('confirmation_cancelled');
  return (await supervisor()).uninstallLocalState(app.getPath('userData'));
});
ipcMain.handle('desktop:tail-log', async (event) => { assertTrustedIpc(event); return (await supervisor()).tailLogNewestFirst(); });
ipcMain.handle('desktop:diagnostics', async (event) => {
  assertTrustedIpc(event);
  const sup = await supervisor();
  return {
    status: sup.status(),
    activity: await sup.activitySummary(),
    workerLog: await sup.tailLogNewestFirst(),
    registrationDebugLog: await sup.registrationDebugLog()
  };
});
ipcMain.handle('desktop:register-worker', async (event, enrollmentCode: unknown) => {
  assertTrustedIpc(event);
  return (await supervisor()).register(validateEnrollmentCode(enrollmentCode));
});
ipcMain.handle('desktop:pull-model', async (event, model: unknown) => {
  assertTrustedIpc(event);
  return pullOllamaModel(validateModelName(model), true);
});
ipcMain.handle('desktop:start-model-download', async (event, model: unknown) => {
  assertTrustedIpc(event);
  return startOllamaModelDownload(validateModelName(model), true);
});
ipcMain.handle('desktop:model-download-status', async (event, id: unknown) => {
  assertTrustedIpc(event);
  return modelDownloadStatus(validateDownloadId(id));
});
ipcMain.handle('desktop:check-for-updates', async (event) => {
  assertTrustedIpc(event);
  return checkForUpdates();
});

ipcMain.handle('desktop:open-external', async (event, url: unknown) => {
  assertTrustedIpc(event);
  await shell.openExternal(validateExternalUrl(url));
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('before-quit', () => { (app as typeof app & { isQuitting?: boolean }).isQuitting = true; });
app.on('second-instance', () => { showMainWindow(true); });
app.on('window-all-closed', () => {
  // Keep running in the tray unless the user explicitly quits.
});
app.on('activate', () => {
  if (mainWindow) { showMainWindow(true); return; }
  void createWindow();
});

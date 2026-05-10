import { app, BrowserWindow, ipcMain, shell } from 'electron';
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

async function createWindow() {
  const settings = await loadDesktopSettings(appDir);
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    title: 'OpenCause Compute Worker',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(resolveStaticIndex());
  if (settings.startMinimized) win.minimize();
  if (settings.autoStartWorker && !settings.localPaused && settings.resourceControls.schedule !== 'manual') {
    void supervisor().then((sup) => sup.startLoop());
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

ipcMain.handle('desktop:get-state', async () => {
  const settings = await loadDesktopSettings(appDir);
  const sup = await supervisor();
  const runtime = sup.status();
  const credentials = await sup.readCredentials();
  const modelRuntime = await modelRuntimeStatus(settings.modelRuntime.model);
  const resources = await resourceStatus(settings);
  const modelRecommendation = recommendedModelConfig(settings);
  return {
    settings: redactedSettings(settings),
    runtime,
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

ipcMain.handle('desktop:update-settings', async (_event: unknown, update: unknown) => {
  const settings = await updateDesktopSettings(appDir, update as Partial<DesktopSettings>);
  cachedSupervisor = null;
  cachedSupervisorKey = '';
  app.setLoginItemSettings({ openAtLogin: settings.startupOnLogin, openAsHidden: settings.startMinimized });
  return redactedSettings(settings);
});

ipcMain.handle('desktop:start-worker', async () => {
  const settings = await updateDesktopSettings(appDir, { localPaused: false });
  if (settings.resourceControls.schedule === 'manual') {
    return (await supervisor()).status();
  }
  return (await supervisor()).startLoop();
});
ipcMain.handle('desktop:run-now', async () => {
  await updateDesktopSettings(appDir, { localPaused: false });
  return (await supervisor()).startLoop({ forceNow: true });
});
ipcMain.handle('desktop:pause-worker', async () => {
  await updateDesktopSettings(appDir, { localPaused: true });
  return (await supervisor()).stop();
});
ipcMain.handle('desktop:stop-worker', async () => (await supervisor()).stop());
ipcMain.handle('desktop:uninstall-local-state', async () => (await supervisor()).uninstallLocalState());
ipcMain.handle('desktop:tail-log', async () => (await supervisor()).tailLogNewestFirst());
ipcMain.handle('desktop:diagnostics', async () => {
  const sup = await supervisor();
  return {
    status: sup.status(),
    workerLog: await sup.tailLogNewestFirst(),
    registrationDebugLog: await sup.registrationDebugLog()
  };
});
ipcMain.handle('desktop:register-worker', async (_event: unknown, enrollmentCode: unknown) => {
  if (typeof enrollmentCode !== 'string' || enrollmentCode.trim().length < 8) throw new Error('enrollment_code_required');
  return (await supervisor()).register(enrollmentCode.trim());
});
ipcMain.handle('desktop:pull-model', async (_event: unknown, model: unknown) => {
  if (typeof model !== 'string') throw new Error('model_required');
  return pullOllamaModel(model);
});
ipcMain.handle('desktop:start-model-download', async (_event: unknown, model: unknown) => {
  if (typeof model !== 'string') throw new Error('model_required');
  return startOllamaModelDownload(model);
});
ipcMain.handle('desktop:model-download-status', async (_event: unknown, id: unknown) => {
  if (typeof id !== 'string') throw new Error('download_id_required');
  return modelDownloadStatus(id);
});
ipcMain.handle('desktop:open-external', async (_event: unknown, url: unknown) => {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('invalid_url');
  await shell.openExternal(url);
  return { ok: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopViewModel } from './view-model.js';
import { loadDesktopSettings, redactedSettings, updateDesktopSettings, type DesktopSettings } from './settings.js';
import { WorkerSupervisor } from './supervisor.js';
import { modelRuntimeStatus, pullOllamaModel } from './model-runtime.js';

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

async function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    title: 'OpenCause Compute Worker',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(resolveStaticIndex());
}

async function supervisor() {
  const settings = await loadDesktopSettings(appDir);
  return new WorkerSupervisor({
    workerEntry,
    appDir,
    coordinatorUrl: settings.coordinatorUrl,
    enrollmentCode: settings.enrollmentCode,
    nodeId: settings.nodeId,
    nodeToken: settings.nodeToken
  });
}

ipcMain.handle('desktop:get-state', async () => {
  const settings = await loadDesktopSettings(appDir);
  const sup = await supervisor();
  const runtime = sup.status();
  const modelRuntime = await modelRuntimeStatus(settings.modelRuntime.model);
  return {
    settings: redactedSettings(settings),
    runtime,
    modelRuntime,
    viewModel: buildDesktopViewModel({
      settings,
      runtime,
      disclaimerAccepted: false,
      runtimeAvailable: modelRuntime.available && modelRuntime.selectedModelInstalled,
      publicEnrollmentEnabled: false
    })
  };
});

ipcMain.handle('desktop:update-settings', async (_event: unknown, update: unknown) => {
  const settings = await updateDesktopSettings(appDir, update as Partial<DesktopSettings>);
  return redactedSettings(settings);
});

ipcMain.handle('desktop:start-worker', async () => (await supervisor()).startLoop());
ipcMain.handle('desktop:stop-worker', async () => (await supervisor()).stop());
ipcMain.handle('desktop:tail-log', async () => (await supervisor()).tailLog());
ipcMain.handle('desktop:pull-model', async (_event: unknown, model: unknown) => {
  if (typeof model !== 'string') throw new Error('model_required');
  return pullOllamaModel(model);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopViewModel } from './view-model.js';
import { loadDesktopSettings, redactedSettings, updateDesktopSettings, type DesktopSettings } from './settings.js';
import { WorkerSupervisor } from './supervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(app.getPath('userData'), 'opencause-worker');
const workerEntry = path.resolve(__dirname, '../../worker/dist/index.js');

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

  await win.loadFile(path.resolve(__dirname, '../static/index.html'));
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
  return {
    settings: redactedSettings(settings),
    runtime: sup.status(),
    viewModel: buildDesktopViewModel({
      settings,
      runtime: sup.status(),
      disclaimerAccepted: false,
      runtimeAvailable: false,
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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

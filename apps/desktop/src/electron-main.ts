import { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, type BrowserWindow as BrowserWindowType, type MenuItemConstructorOptions } from 'electron';
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

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
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
        { label: 'Show Dashboard', accelerator: 'CmdOrCtrl+1', click: showMainWindow },
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
        { label: 'Show OpenCause Compute', click: showMainWindow },
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
    { label: 'Show OpenCause Compute', click: showMainWindow },
    { label: 'Quit', click: () => { app.quit(); } }
  ]));
  tray.on('click', showMainWindow);
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
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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
  if (settings.startMinimized) win.hide();
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
  const activity = await sup.activitySummary();
  const credentials = await sup.readCredentials();
  const modelRuntime = await modelRuntimeStatus(settings.modelRuntime.model);
  const resources = await resourceStatus(settings);
  const modelRecommendation = recommendedModelConfig(settings);
  return {
    settings: redactedSettings(settings),
    runtime,
    activity,
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
    activity: await sup.activitySummary(),
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
  return pullOllamaModel(model, true);
});
ipcMain.handle('desktop:start-model-download', async (_event: unknown, model: unknown) => {
  if (typeof model !== 'string') throw new Error('model_required');
  return startOllamaModelDownload(model, true);
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
app.on('before-quit', () => { (app as typeof app & { isQuitting?: boolean }).isQuitting = true; });
app.on('window-all-closed', () => {
  // Keep running in the tray unless the user explicitly quits.
});
app.on('activate', () => {
  if (mainWindow) { showMainWindow(); return; }
  void createWindow();
});

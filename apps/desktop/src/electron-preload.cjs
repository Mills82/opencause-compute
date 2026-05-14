const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opencauseDesktop', {
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  updateSettings: (update) => ipcRenderer.invoke('desktop:update-settings', update),
  startWorker: () => ipcRenderer.invoke('desktop:start-worker'),
  runNow: () => ipcRenderer.invoke('desktop:run-now'),
  pauseWorker: () => ipcRenderer.invoke('desktop:pause-worker'),
  stopWorker: () => ipcRenderer.invoke('desktop:stop-worker'),
  uninstallLocalState: () => ipcRenderer.invoke('desktop:uninstall-local-state', { confirmed: true }),
  tailLog: () => ipcRenderer.invoke('desktop:tail-log'),
  diagnostics: () => ipcRenderer.invoke('desktop:diagnostics'),
  registerWorker: (enrollmentCode) => ipcRenderer.invoke('desktop:register-worker', enrollmentCode),
  freshProfileSetupUrl: () => ipcRenderer.invoke('desktop:fresh-profile-setup-url'),
  startModelDownload: (model) => ipcRenderer.invoke('desktop:start-model-download', model),
  modelDownloadStatus: (id) => ipcRenderer.invoke('desktop:model-download-status', id),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  pullModel: (model) => ipcRenderer.invoke('desktop:pull-model', model),
  runLocalBakeoff: (models, options) => ipcRenderer.invoke('desktop:run-local-bakeoff', { models, useSchemaFormat: options?.useSchemaFormat !== false }),
  removeModel: (model) => ipcRenderer.invoke('desktop:remove-model', model),
  testModelReadiness: (model) => ipcRenderer.invoke('desktop:test-model-readiness', model)
});

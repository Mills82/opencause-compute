import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('opencauseDesktop', {
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  updateSettings: (update: unknown) => ipcRenderer.invoke('desktop:update-settings', update),
  startWorker: () => ipcRenderer.invoke('desktop:start-worker'),
  pauseWorker: () => ipcRenderer.invoke('desktop:pause-worker'),
  stopWorker: () => ipcRenderer.invoke('desktop:stop-worker'),
  uninstallLocalState: () => ipcRenderer.invoke('desktop:uninstall-local-state'),
  tailLog: () => ipcRenderer.invoke('desktop:tail-log'),
  registerWorker: (enrollmentCode: string) => ipcRenderer.invoke('desktop:register-worker', enrollmentCode),
  startModelDownload: (model: string) => ipcRenderer.invoke('desktop:start-model-download', model),
  modelDownloadStatus: (id: string) => ipcRenderer.invoke('desktop:model-download-status', id),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:open-external', url),
  pullModel: (model: string) => ipcRenderer.invoke('desktop:pull-model', model)
});

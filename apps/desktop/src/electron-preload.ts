import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('opencauseDesktop', {
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  updateSettings: (update: unknown) => ipcRenderer.invoke('desktop:update-settings', update),
  startWorker: () => ipcRenderer.invoke('desktop:start-worker'),
  stopWorker: () => ipcRenderer.invoke('desktop:stop-worker'),
  tailLog: () => ipcRenderer.invoke('desktop:tail-log')
});

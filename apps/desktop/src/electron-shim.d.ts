declare module 'electron' {
  export const app: {
    getPath(name: string): string;
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    quit(): void;
  };
  export class BrowserWindow {
    constructor(options: Record<string, unknown>);
    loadFile(file: string): Promise<void>;
    static getAllWindows(): BrowserWindow[];
  }
  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  };
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
}

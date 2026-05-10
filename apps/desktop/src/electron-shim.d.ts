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
    show(): void;
    hide(): void;
    focus(): void;
    reload(): void;
    setContentSize(width: number, height: number): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    static getAllWindows(): BrowserWindow[];
  }
  export const nativeImage: {
    createFromPath(path: string): { resize(options: Record<string, unknown>): unknown };
  };
  export class Tray {
    constructor(image: unknown);
    setToolTip(text: string): void;
    setContextMenu(menu: unknown): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }
  export const Menu: {
    buildFromTemplate(template: unknown[]): unknown;
    setApplicationMenu(menu: unknown): void;
  };
  export const shell: {
    openExternal(url: string): Promise<void>;
  };
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

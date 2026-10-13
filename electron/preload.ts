import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  isElectron: boolean;
  platform: 'darwin' | 'win32' | 'linux';
  openFiles: (options?: { title?: string; multiSelections?: boolean; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  saveExportDialog: (defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>;
  writeExportBuffer: (filePath: string, buffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  showInFolder: (filePath: string) => Promise<void>;
}

const api: ElectronAPI = {
  isElectron: true,
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  openFiles: (options) => ipcRenderer.invoke('dialog:openFiles', options),
  saveExportDialog: (defaultName) => ipcRenderer.invoke('dialog:saveExport', defaultName),
  writeExportBuffer: (filePath, buffer) => ipcRenderer.invoke('file:writeExportBuffer', filePath, buffer),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
};

contextBridge.exposeInMainWorld('electron', api);

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

import { app, BrowserWindow, shell, ipcMain, dialog, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Enable performance-critical flags for video editing & WebCodecs
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'WebCodecs,SharedArrayBuffer');
// Allocate up to 8GB V8 heap for editing 4K / high-frame-rate videos without tab OOM
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#121214',
    title: 'Jellycut Video Editor',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      spellcheck: false,
      // CRITICAL FOR VIDEO EXPORTS: do not throttle background processing when user switches apps
      backgroundThrottling: false,
    },
  });

  // Inject Cross-Origin-Opener-Policy & Cross-Origin-Embedder-Policy headers for SharedArrayBuffer / FFmpeg WASM
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    });
  });

  // Handle external links safely in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native IPC Dialogs & System Integrations
ipcMain.handle('dialog:openFiles', async (_event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options?.title || 'Import Media Files',
    properties: options?.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: options?.filters || [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'] },
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'] },
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result;
});

ipcMain.handle('dialog:saveExport', async (_event, defaultName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Video',
    defaultPath: defaultName || 'Jellycut-Export.mp4',
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'WebM Video', extensions: ['webm'] },
    ],
  });
  return result;
});

ipcMain.handle('file:writeExportBuffer', async (_event, filePath: string, bufferArray: ArrayBuffer) => {
  try {
    const buffer = Buffer.from(bufferArray);
    await fs.promises.writeFile(filePath, buffer);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to write file' };
  }
});

ipcMain.handle('shell:showInFolder', async (_event, filePath: string) => {
  if (filePath) {
    shell.showItemInFolder(filePath);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

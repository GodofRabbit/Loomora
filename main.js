const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const {
  collectConversationTurns,
  currentGalleryRoot,
  listGallery,
  registerGalleryHandlers,
  registerGalleryProtocol,
  registerGalleryScheme,
  saveConversationTurn,
} = require('./electron/gallery');
const { registerGenerationHandler } = require('./electron/generation');
const {
  describeProvider,
  getProvider,
  listProviders,
} = require('./electron/providers');
const {
  registerGenerationQueueHandlers,
} = require('./electron/generationQueue');
const { registerBackupHandlers } = require('./electron/backup');
const { registerLocalDataHandlers } = require('./electron/localData');
const { registerPreferenceHandlers } = require('./electron/preferences');
const { registerUpdateHandlers } = require('./electron/updateService');
const {
  registerSecureCredentialHandlers,
} = require('./electron/secureCredentials');
const { registerShortcutHandlers } = require('./electron/shortcuts');
const {
  destroyWorker: destroyOcrWorker,
  registerOcrHandlers,
} = require('./electron/ocr');
const APP_ICON_PATH =
  process.platform === 'win32'
    ? path.join(__dirname, 'build', 'icon-system.ico')
    : path.join(__dirname, 'renderer', 'assets', 'logo-system.png');
let applicationIcon;
let mainWindow;

function configureUserDataPath() {
  if (app.isPackaged) return;
  app.setPath('userData', path.join(app.getPath('appData'), 'Loomora Dev'));
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#070817',
    autoHideMenuBar: true,
    ...(applicationIcon?.isEmpty?.() === false
      ? { icon: applicationIcon }
      : {}),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 11 },
        }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#0b0818',
            symbolColor: '#eee8fa',
            height: 36,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.setMenuBarVisibility(false);
  if (app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (
        key === 'f12' ||
        ((input.control || input.meta) && input.shift && key === 'i')
      ) {
        event.preventDefault();
      }
    });
  }
  process.env.VITE_DEV_SERVER_URL
    ? window.loadURL(process.env.VITE_DEV_SERVER_URL)
    : window.loadFile(path.join(__dirname, 'renderer-dist', 'index.html'));
}

configureUserDataPath();
registerGalleryScheme();
registerGalleryHandlers();
registerBackupHandlers({
  collectConversationTurns,
  currentGalleryRoot,
  listGallery,
  saveConversationTurn,
});
registerGenerationHandler();
ipcMain.handle('list-generation-providers', () => listProviders());
ipcMain.handle('describe-generation-provider', (_event, payload) => {
  const description = describeProvider(payload?.providerId, {
    endpoint: String(payload?.endpoint || ''),
    model: String(payload?.model || ''),
  });
  return (
    description || {
      id: String(payload?.providerId || ''),
      label: '',
      capabilities: {},
    }
  );
});
ipcMain.handle('test-generation-provider', async (_event, payload) => {
  const provider = getProvider(payload?.providerId);
  if (!provider?.testConnection) {
    return { ok: false, error: '当前服务暂不支持连接测试' };
  }
  const endpoint = String(payload?.endpoint || '').trim();
  const apiKey = String(payload?.apiKey || '').trim();
  const capabilities = describeProvider(payload?.providerId, {
    endpoint,
    model: String(payload?.model || ''),
  })?.capabilities;
  const endpointMissing = capabilities?.requiresEndpoint !== false && !endpoint;
  const keyMissing = capabilities?.requiresApiKey !== false && !apiKey;
  if (endpointMissing || keyMissing) {
    return {
      ok: false,
      error:
        endpointMissing && keyMissing
          ? '请先填写接口地址和 API Key'
          : endpointMissing
            ? '请先填写接口地址'
            : '请先填写 API Key',
    };
  }
  try {
    return await provider.testConnection({
      endpoint,
      apiKey,
      model: String(payload?.model || ''),
    });
  } catch (error) {
    return { ok: false, error: String(error?.message || '连接测试失败') };
  }
});
ipcMain.handle('list-generation-provider-models', async (_event, payload) => {
  const provider = getProvider(payload?.providerId);
  if (!provider?.listModels) {
    return { ok: false, error: '当前服务暂不支持读取模型' };
  }
  const endpoint = String(payload?.endpoint || '').trim();
  const apiKey = String(payload?.apiKey || '').trim();
  const capabilities = describeProvider(payload?.providerId, {
    endpoint,
    model: String(payload?.model || ''),
  })?.capabilities;
  const endpointMissing = capabilities?.requiresEndpoint !== false && !endpoint;
  const keyMissing = capabilities?.requiresApiKey !== false && !apiKey;
  if (endpointMissing || keyMissing) {
    return {
      ok: false,
      error:
        endpointMissing && keyMissing
          ? '请先填写接口地址和 API Key'
          : endpointMissing
            ? '请先填写接口地址'
            : '请先填写 API Key',
    };
  }
  try {
    return await provider.listModels({ endpoint, apiKey });
  } catch (error) {
    return { ok: false, error: String(error?.message || '模型列表获取失败') };
  }
});
registerGenerationQueueHandlers();
registerOcrHandlers();
registerPreferenceHandlers();
registerSecureCredentialHandlers();
registerShortcutHandlers();
registerLocalDataHandlers();
const updateHandlers = registerUpdateHandlers(() => mainWindow);
ipcMain.handle('check-for-updates', () => updateHandlers.checkForUpdates());
ipcMain.handle('download-update', () => updateHandlers.downloadUpdate());
ipcMain.handle('install-update', () => updateHandlers.installUpdate());
ipcMain.handle('get-update-state', () => updateHandlers.getState());
ipcMain.handle('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  author: '伟大的兔神',
  email: 'believe_rl@163.com',
}));

app.whenReady().then(() => {
  applicationIcon = nativeImage.createFromPath(APP_ICON_PATH);
  if (process.platform === 'darwin' && applicationIcon.isEmpty() === false) {
    app.dock?.setIcon(applicationIcon);
  }
  registerGalleryProtocol();
  createWindow();
  // Packaged apps check Gitee first and fall back to GitHub after startup.
  setTimeout(() => updateHandlers.checkForUpdates(), 8000);
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on('before-quit', () => destroyOcrWorker('应用正在退出'));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
let workerWindow;
let workerReady;
let resolveWorkerReady;
let rejectWorkerReady;
let workerReadyTimer;
let nextRequestId = 0;
const pendingRequests = new Map();

function rejectPending(message) {
  for (const { reject } of pendingRequests.values()) {
    reject(new Error(message));
  }
  pendingRequests.clear();
}

function destroyWorker(message = '文字识别已取消') {
  rejectPending(message);
  if (workerWindow && !workerWindow.isDestroyed()) workerWindow.destroy();
  workerWindow = undefined;
  workerReady = undefined;
  resolveWorkerReady = undefined;
  rejectWorkerReady = undefined;
  clearTimeout(workerReadyTimer);
  workerReadyTimer = undefined;
}

function createWorkerWindow() {
  if (workerWindow && !workerWindow.isDestroyed()) return workerWindow;
  workerReady = new Promise((resolve, reject) => {
    resolveWorkerReady = resolve;
    rejectWorkerReady = reject;
    workerReadyTimer = setTimeout(
      () => reject(new Error('文字识别进程启动超时')),
      15000,
    );
  });
  workerWindow = new BrowserWindow({
    show: false,
    width: 640,
    height: 480,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'ocr-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  workerWindow.on('closed', () => {
    rejectWorkerReady?.(new Error('文字识别进程已关闭'));
    clearTimeout(workerReadyTimer);
    rejectPending('文字识别进程已结束');
    workerWindow = undefined;
    workerReady = undefined;
    resolveWorkerReady = undefined;
    rejectWorkerReady = undefined;
    workerReadyTimer = undefined;
  });
  workerWindow.webContents.on('did-fail-load', (_event, _code, description) => {
    rejectWorkerReady?.(
      new Error(`文字识别进程加载失败：${description || '未知原因'}`),
    );
  });
  workerWindow.webContents.on('render-process-gone', () => {
    destroyWorker('文字识别进程异常退出');
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    workerWindow.loadURL(
      `${process.env.VITE_DEV_SERVER_URL.replace(/\/$/, '')}/ocr-worker.html`,
    );
  } else {
    workerWindow.loadFile(
      path.join(APP_ROOT, 'renderer-dist', 'ocr-worker.html'),
    );
  }
  return workerWindow;
}

async function recognizeText(payload) {
  const source = String(payload?.source || '');
  if (!source.startsWith('data:image/')) throw new Error('待识别图片数据无效');
  const window = createWorkerWindow();
  try {
    await workerReady;
  } catch (error) {
    destroyWorker('文字识别进程启动失败');
    throw error;
  }
  if (window.isDestroyed()) throw new Error('文字识别进程启动失败');
  const id = `ocr-${Date.now()}-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    window.webContents.send('ocr-worker-recognize', { id, source });
  });
}

function registerOcrHandlers() {
  ipcMain.on('ocr-worker-ready', (event) => {
    if (event.sender !== workerWindow?.webContents) return;
    clearTimeout(workerReadyTimer);
    workerReadyTimer = undefined;
    resolveWorkerReady?.();
    resolveWorkerReady = undefined;
    rejectWorkerReady = undefined;
  });
  ipcMain.on('ocr-worker-result', (event, payload) => {
    if (event.sender !== workerWindow?.webContents) return;
    const request = pendingRequests.get(payload?.id);
    if (!request) return;
    pendingRequests.delete(payload.id);
    if (payload?.error) request.reject(new Error(payload.error));
    else
      request.resolve({
        lines: Array.isArray(payload?.lines) ? payload.lines : [],
      });
  });
  ipcMain.handle('recognize-text', (_event, payload) => recognizeText(payload));
  ipcMain.handle('cancel-ocr', () => {
    destroyWorker();
    return true;
  });
}

module.exports = { destroyWorker, registerOcrHandlers };

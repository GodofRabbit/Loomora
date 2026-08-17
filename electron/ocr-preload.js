const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ocrWorker', {
  readModel: (relativePath) =>
    ipcRenderer.invoke('read-ocr-model', relativePath),
  ready: () => ipcRenderer.send('ocr-worker-ready'),
  onRecognize: (callback) => {
    ipcRenderer.on('ocr-worker-recognize', (_event, payload) =>
      callback(payload),
    );
  },
  onWarmup: (callback) => {
    ipcRenderer.on('ocr-worker-warmup', () => callback());
  },
  sendResult: (payload) => ipcRenderer.send('ocr-worker-result', payload),
});

const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('forge', {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
  cancelGenerate: () => ipcRenderer.invoke('cancel-generate'),
  onGenerationUpdate: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('generation-update', listener);
    return () => ipcRenderer.removeListener('generation-update', listener);
  },
  listGallery: () => ipcRenderer.invoke('list-gallery'),
  getGalleryStorage: () => ipcRenderer.invoke('get-gallery-storage'),
  chooseGalleryStorage: (currentPath) =>
    ipcRenderer.invoke('choose-gallery-storage', currentPath),
  setGalleryStorage: (directory) =>
    ipcRenderer.invoke('set-gallery-storage', directory),
  readGalleryImage: (filePath) =>
    ipcRenderer.invoke('read-gallery-image', filePath),
  listConversationHistory: (payload) =>
    ipcRenderer.invoke('list-conversation-history', payload),
  saveConversationTurn: (turn) =>
    ipcRenderer.invoke('save-conversation-turn', turn),
  findConversationByImage: (filePath) =>
    ipcRenderer.invoke('find-conversation-by-image', filePath),
  deleteConversationTurn: (turnId) =>
    ipcRenderer.invoke('delete-conversation-turn', turnId),
  importGalleryImages: (files) => {
    const filePaths = files
      ? Array.from(files, (file) => webUtils.getPathForFile(file)).filter(
          Boolean,
        )
      : null;
    return ipcRenderer.invoke('import-gallery-images', filePaths);
  },
  exportGalleryImages: (payload) =>
    ipcRenderer.invoke('export-gallery-images', payload),
  saveEditedImage: (payload) =>
    ipcRenderer.invoke('save-edited-image', payload),
  downloadImage: (payload) => ipcRenderer.invoke('download-image', payload),
  copyImage: (src, filePath) =>
    ipcRenderer.invoke('copy-image', { src, filePath }),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  readOcrModel: (relativePath) =>
    ipcRenderer.invoke('read-ocr-model', relativePath),
  recognizeText: (payload) => ipcRenderer.invoke('recognize-text', payload),
  cancelOcr: () => ipcRenderer.invoke('cancel-ocr'),
  deleteGalleryImages: (filePaths) =>
    ipcRenderer.invoke('delete-gallery-images', filePaths),
  renameImage: (payload) => ipcRenderer.invoke('rename-image', payload),
  showImageInFolder: (filePath) =>
    ipcRenderer.invoke('show-image-in-folder', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
});

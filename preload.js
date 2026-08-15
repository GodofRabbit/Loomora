const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('forge', {
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
  cancelGenerate: () => ipcRenderer.invoke('cancel-generate'),
  onGenerationUpdate: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('generation-update', listener);
    return () => ipcRenderer.removeListener('generation-update', listener);
  },
  listGallery: () => ipcRenderer.invoke('list-gallery'),
  listConversationHistory: () =>
    ipcRenderer.invoke('list-conversation-history'),
  saveConversationTurn: (turn) =>
    ipcRenderer.invoke('save-conversation-turn', turn),
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
  copyImage: (src) => ipcRenderer.invoke('copy-image', src),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  readOcrModel: (relativePath) =>
    ipcRenderer.invoke('read-ocr-model', relativePath),
  deleteImage: (filePath) => ipcRenderer.invoke('delete-image', filePath),
  renameImage: (payload) => ipcRenderer.invoke('rename-image', payload),
  showImageInFolder: (filePath) =>
    ipcRenderer.invoke('show-image-in-folder', filePath),
});

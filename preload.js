const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('forge', {
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
  onGenerationStatus: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('generation-status', listener);
    return () => ipcRenderer.removeListener('generation-status', listener);
  },
  listGallery: () => ipcRenderer.invoke('list-gallery'),
  importGalleryImages: (files) => {
    const filePaths = files
      ? Array.from(files, (file) => webUtils.getPathForFile(file)).filter(
          Boolean,
        )
      : null;
    return ipcRenderer.invoke('import-gallery-images', filePaths);
  },
  saveEditedImage: (payload) =>
    ipcRenderer.invoke('save-edited-image', payload),
  downloadImage: (payload) => ipcRenderer.invoke('download-image', payload),
  copyImage: (src) => ipcRenderer.invoke('copy-image', src),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  readOcrModel: (relativePath) =>
    ipcRenderer.invoke('read-ocr-model', relativePath),
  deleteImage: (filePath) => ipcRenderer.invoke('delete-image', filePath),
  showImageInFolder: (filePath) =>
    ipcRenderer.invoke('show-image-in-folder', filePath),
});

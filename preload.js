const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('forge', {
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
  onGenerationStatus: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('generation-status', listener);
    return () => ipcRenderer.removeListener('generation-status', listener);
  },
  listGallery: () => ipcRenderer.invoke('list-gallery'),
  copyImage: (src) => ipcRenderer.invoke('copy-image', src),
  deleteImage: (filePath) => ipcRenderer.invoke('delete-image', filePath),
  showImageInFolder: (filePath) =>
    ipcRenderer.invoke('show-image-in-folder', filePath),
});

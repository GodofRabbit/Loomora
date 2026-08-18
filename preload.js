const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('forge', {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getOnboardingComplete: () => ipcRenderer.invoke('get-onboarding-complete'),
  setOnboardingComplete: () => ipcRenderer.invoke('set-onboarding-complete'),
  getSecureApiKey: () => ipcRenderer.invoke('get-secure-api-key'),
  setSecureApiKey: (value) => ipcRenderer.invoke('set-secure-api-key', value),
  clearSecureApiKey: () => ipcRenderer.invoke('clear-secure-api-key'),
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  setShortcuts: (value) => ipcRenderer.invoke('set-shortcuts', value),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
  cancelGenerate: () => ipcRenderer.invoke('cancel-generate'),
  listGenerationQueue: () => ipcRenderer.invoke('list-generation-queue'),
  enqueueGenerationTask: (request) =>
    ipcRenderer.invoke('enqueue-generation-task', request),
  getGenerationQueueTask: (id) =>
    ipcRenderer.invoke('get-generation-queue-task', id),
  updateGenerationQueueTask: (payload) =>
    ipcRenderer.invoke('update-generation-queue-task', payload),
  removeGenerationQueueTask: (id) =>
    ipcRenderer.invoke('remove-generation-queue-task', id),
  clearFinishedGenerationTasks: () =>
    ipcRenderer.invoke('clear-finished-generation-tasks'),
  onGenerationUpdate: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('generation-update', listener);
    return () => ipcRenderer.removeListener('generation-update', listener);
  },
  listGallery: () => ipcRenderer.invoke('list-gallery'),
  listGalleryTrash: () => ipcRenderer.invoke('list-gallery-trash'),
  restoreGalleryTrashItem: (id) =>
    ipcRenderer.invoke('restore-gallery-trash-item', id),
  deleteGalleryTrashItems: (ids) =>
    ipcRenderer.invoke('delete-gallery-trash-items', ids),
  emptyGalleryTrash: () => ipcRenderer.invoke('empty-gallery-trash'),
  getGalleryStorage: () => ipcRenderer.invoke('get-gallery-storage'),
  chooseGalleryStorage: (currentPath) =>
    ipcRenderer.invoke('choose-gallery-storage', currentPath),
  setGalleryStorage: (directory) =>
    ipcRenderer.invoke('set-gallery-storage', directory),
  clearLocalData: () => ipcRenderer.invoke('clear-local-data'),
  createLocalBackup: () => ipcRenderer.invoke('create-local-backup'),
  restoreLocalBackup: () => ipcRenderer.invoke('restore-local-backup'),
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
  setGalleryFavorite: (filePath, favorite) =>
    ipcRenderer.invoke('set-gallery-favorite', { filePath, favorite }),
  getGalleryFavorite: (filePath) =>
    ipcRenderer.invoke('get-gallery-favorite', filePath),
  getGalleryImageMetadata: (filePath) =>
    ipcRenderer.invoke('get-gallery-image-metadata', filePath),
  updateGalleryImageMetadata: (filePath, metadata) =>
    ipcRenderer.invoke('update-gallery-image-metadata', {
      filePath,
      metadata,
    }),
  getGalleryMetadataFacets: () =>
    ipcRenderer.invoke('get-gallery-metadata-facets'),
  searchGalleryMetadata: (query) =>
    ipcRenderer.invoke('search-gallery-metadata', query),
  restoreGalleryImageVersion: (filePath) =>
    ipcRenderer.invoke('restore-gallery-image-version', filePath),
  renameImage: (payload) => ipcRenderer.invoke('rename-image', payload),
  showImageInFolder: (filePath) =>
    ipcRenderer.invoke('show-image-in-folder', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
});

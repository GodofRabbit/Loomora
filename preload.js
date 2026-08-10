const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('forge', {
  pickImage: () => ipcRenderer.invoke('pick-image'),
  generate: (p) => ipcRenderer.invoke('generate', p),
})

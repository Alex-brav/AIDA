const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aida', {
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onState: (callback) => ipcRenderer.on('state', (_event, state) => callback(state)),
  onHop: (callback) => ipcRenderer.on('hop', (_event, height) => callback(height)),
});
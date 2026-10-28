const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aida', {
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onState: (callback) => ipcRenderer.on('state', (_event, state) => callback(state)),
  onEmote: (callback) => ipcRenderer.on('emote', (_event, name) => callback(name)),
});

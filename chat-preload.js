const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chat', {
  send: (text) => ipcRenderer.send('chat-send', text),
  close: () => ipcRenderer.send('chat-close'),
  onStart: (callback) => ipcRenderer.on('chat-start', () => callback()),
  onPiece: (callback) => ipcRenderer.on('chat-piece', (_event, piece) => callback(piece)),
  onDone: (callback) => ipcRenderer.on('chat-done', () => callback()),
});

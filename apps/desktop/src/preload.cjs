const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  connection: () => ipcRenderer.invoke('connection'),
  openTerminal: () => ipcRenderer.invoke('terminal'),
  close: () => ipcRenderer.send('close'),
  minimize: () => ipcRenderer.send('minimize'),
});

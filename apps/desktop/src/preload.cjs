const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  connection: () => ipcRenderer.invoke('connection'),
  openTerminal: () => ipcRenderer.invoke('terminal'),
  voiceStatus: () => ipcRenderer.invoke('voice:status'),
  armAudio: kind => ipcRenderer.invoke('voice:arm', kind),
  disarmAudio: () => ipcRenderer.invoke('voice:disarm'),
  transcribe: input => ipcRenderer.invoke('voice:transcribe', input),
  synthesize: input => ipcRenderer.invoke('voice:synthesize', input),
  cancelVoice: id => ipcRenderer.invoke('voice:cancel', id),
  close: () => ipcRenderer.send('close'),
  minimize: () => ipcRenderer.send('minimize'),
});

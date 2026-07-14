const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setCloseBehavior: (behavior) => ipcRenderer.send('set-close-behavior', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('get-close-behavior')
});

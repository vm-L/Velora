import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (callback: () => void) => ipcRenderer.on('window-maximized', () => callback()),
  onWindowUnmaximized: (callback: () => void) => ipcRenderer.on('window-unmaximized', () => callback()),
  setCloseBehavior: (behavior: string) => ipcRenderer.send('set-setting', 'closeBehavior', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('get-setting', 'closeBehavior')
})

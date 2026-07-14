import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (callback: () => void) => ipcRenderer.on('window-maximized', () => callback()),
  onWindowUnmaximized: (callback: () => void) => ipcRenderer.on('window-unmaximized', () => callback()),
  setSetting: (key: string, value: any) => ipcRenderer.send('set-setting', key, value),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setCloseBehavior: (behavior: string) => ipcRenderer.send('set-setting', 'closeBehavior', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('get-setting', 'closeBehavior'),
  onWebviewNewWindow: (callback: (url: string) => void) => {
    // Need to remove previous listeners if re-mounted to prevent duplicates, but simpler here
    ipcRenderer.removeAllListeners('webview-new-window')
    ipcRenderer.on('webview-new-window', (_event, url) => callback(url))
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url)
})

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
  onMediaSniffed: (callback: (data: any) => void) => ipcRenderer.on('media-sniffed', (_event, data) => callback(data)),
  copyImage: (url: string) => ipcRenderer.invoke('copy-image', url),
  fetchImageBase64: (url: string) => ipcRenderer.invoke('fetch-image-base64', url),
  fetchUrl: (url: string) => ipcRenderer.invoke('fetch-url', url),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  showItemInFolder: (filePath: string) => ipcRenderer.send('show-item-in-folder', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveImages: (dirPath: string, files: { url: string, name: string }[]) => ipcRenderer.invoke('save-images', dirPath, files),
  startDownload: (cmd: any) => ipcRenderer.send('start-download', cmd),
  pauseDownload: (id: string) => ipcRenderer.send('pause-download', id),
  cancelDownload: (id: string) => ipcRenderer.send('cancel-download', id),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke('file-exists', filePath),
  onDownloadProgress: (callback: (data: any) => void) => ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  log: (level: string, scope: string, message: string) => ipcRenderer.send('log-message', { level, scope, message })
})

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (callback: () => void) => ipcRenderer.on('window-maximized', () => callback()),
  onWindowUnmaximized: (callback: () => void) => ipcRenderer.on('window-unmaximized', () => callback()),
  setSetting: (key: string, value: any) => ipcRenderer.send('set-setting', key, value),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  setCloseBehavior: (behavior: string) => ipcRenderer.send('set-setting', 'closeBehavior', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('get-setting', 'closeBehavior'),
  onWebviewNewWindow: (callback: (url: string) => void) => {
    // Listeners are managed properly by each component
    ipcRenderer.on('webview-new-window', (_event, data) => callback(data))
  },
  onMediaSniffed: (callback: (data: any) => void) => {
    ipcRenderer.on('media-sniffed', (_event, data) => callback(data));
  },
  offMediaSniffed: () => {
    ipcRenderer.removeAllListeners('media-sniffed');
  },
  copyImage: (url: string) => ipcRenderer.invoke('copy-image', url),
  fetchImageBase64: (url: string) => ipcRenderer.invoke('fetch-image-base64', url),
  fetchUrl: (url: string) => ipcRenderer.invoke('fetch-url', url),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  showItemInFolder: (filePath: string) => ipcRenderer.send('show-item-in-folder', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  pauseWebview: (id: number) => ipcRenderer.invoke('pause-webview', id),
  resumeWebview: (id: number) => ipcRenderer.invoke('resume-webview', id),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveImages: (dirPath: string, files: { url: string, name: string }[]) => ipcRenderer.invoke('save-images', dirPath, files),
  startDownload: (cmd: any) => ipcRenderer.send('start-download', cmd),
  pauseDownload: (id: string) => ipcRenderer.send('pause-download', id),
  cancelDownload: (id: string) => ipcRenderer.send('cancel-download', id),
  getVideoMediaInfo: (filePath: string) => ipcRenderer.invoke('get-video-media-info', filePath),
  compressVideoTask: (taskId: string, filePath: string, targetBitrateKbps: number) => ipcRenderer.invoke('compress-video-task', taskId, filePath, targetBitrateKbps),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke('file-exists', filePath),
  moveFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('move-file', oldPath, newPath),
  getDirectoryTree: (rootDir: string, maxDepth?: number) => ipcRenderer.invoke('get-directory-tree', rootDir, maxDepth),
  readLocalDirectory: (dirPath: string) => ipcRenderer.invoke('read-local-directory', dirPath),
  createLocalFolder: (folderPath: string) => ipcRenderer.invoke('create-local-folder', folderPath),
  deleteLocalPath: (targetPath: string) => ipcRenderer.invoke('delete-local-path', targetPath),
  scanLocalVideos: (targetPaths: string[]) => ipcRenderer.invoke('scan-local-videos', targetPaths),
  silentParseHtml: (targetUrl: string, scripts?: string[], evalExprs?: string[]) => ipcRenderer.invoke('silent-parse-html', targetUrl, scripts, evalExprs),
  setMediaReferer: (mediaUrl: string, pageUrl: string) => ipcRenderer.invoke('set-media-referer', mediaUrl, pageUrl),
  createMediaClient: (config: { clientId: string, referer: string, origin?: string }) => ipcRenderer.invoke('create-media-client', config),
  destroyMediaClient: (clientId: string) => ipcRenderer.invoke('destroy-media-client', clientId),
  onDownloadProgress: (callback: (data: any) => void) => ipcRenderer.on('download-progress', (_event, data) => callback(data)),
  syncAdBlockSource: (url: string) => ipcRenderer.invoke('sync-adblock-source', url),
  compileAdBlockRules: (sourcesData: Record<string, string>) => ipcRenderer.invoke('compile-adblock-rules', sourcesData),
  exportResourcesJson: (data: any) => ipcRenderer.invoke('export-resources-json', data),
  importResourcesJson: () => ipcRenderer.invoke('import-resources-json'),
  getLanShareStatus: () => ipcRenderer.invoke('get-lan-share-status'),
  restartLanServer: () => ipcRenderer.invoke('restart-lan-server'),
  stopLanServer: () => ipcRenderer.invoke('stop-lan-server'),
  notifyFirstScreenReady: () => ipcRenderer.send('app-first-screen-ready'),
  log: (level: string, scope: string, message: string) => ipcRenderer.send('log-message', { level, scope, message })
})

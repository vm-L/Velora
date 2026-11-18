import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-maximized', handler);
    return () => ipcRenderer.removeListener('window-maximized', handler);
  },
  onWindowUnmaximized: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-unmaximized', handler);
    return () => ipcRenderer.removeListener('window-unmaximized', handler);
  },
  setSetting: (key: string, value: any) => ipcRenderer.send('set-setting', key, value),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  setCloseBehavior: (behavior: string) => ipcRenderer.send('set-setting', 'closeBehavior', behavior),
  getCloseBehavior: () => ipcRenderer.invoke('get-setting', 'closeBehavior'),
  onWebviewNewWindow: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('webview-new-window', handler);
    return () => ipcRenderer.removeListener('webview-new-window', handler);
  },
  onMediaSniffed: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media-sniffed', handler);
    return () => ipcRenderer.removeListener('media-sniffed', handler);
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
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
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
  filesExistBatch: (filePaths: string[]) => ipcRenderer.invoke('files-exist-batch', filePaths),
  moveFile: (oldPath: string, newPath: string, options?: { autoRename?: boolean }) => ipcRenderer.invoke('move-file', oldPath, newPath, options),
  getDirectoryTree: (rootDir: string, maxDepth?: number) => ipcRenderer.invoke('get-directory-tree', rootDir, maxDepth),
  scanDirectoryMediaFiles: (rootDir: string, maxDepth?: number) => ipcRenderer.invoke('scan-directory-media-files', rootDir, maxDepth),
  scanDirectoriesAllFiles: (rootDirs: string[], maxDepth?: number) => ipcRenderer.invoke('scan-directories-all-files', rootDirs, maxDepth),
  readLocalDirectory: (dirPath: string) => ipcRenderer.invoke('read-local-directory', dirPath),
  searchLocalFiles: (dirPath: string, query: string) => ipcRenderer.invoke('search-local-files', dirPath, query),
  createLocalFolder: (folderPath: string) => ipcRenderer.invoke('create-local-folder', folderPath),
  deleteLocalPath: (targetPath: string) => ipcRenderer.invoke('delete-local-path', targetPath),
  scanLocalVideos: (targetPaths: string[]) => ipcRenderer.invoke('scan-local-videos', targetPaths),
  silentParseHtml: (targetUrl: string, scripts?: string[], evalExprs?: string[]) => ipcRenderer.invoke('silent-parse-html', targetUrl, scripts, evalExprs),
  setMediaReferer: (mediaUrl: string, pageUrl: string) => ipcRenderer.invoke('set-media-referer', mediaUrl, pageUrl),
  createMediaClient: (config: { clientId: string, referer: string, origin?: string }) => ipcRenderer.invoke('create-media-client', config),
  destroyMediaClient: (clientId: string) => ipcRenderer.invoke('destroy-media-client', clientId),
  onDownloadProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  syncAdBlockSource: (url: string, sourceId?: string) => ipcRenderer.invoke('sync-adblock-source', url, sourceId),
  compileAdBlockRules: (sourcesOrIds: Record<string, string> | string[]) => ipcRenderer.invoke('compile-adblock-rules', sourcesOrIds),
  exportResourcesJson: (data: any) => ipcRenderer.invoke('export-resources-json', data),
  importResourcesJson: () => ipcRenderer.invoke('import-resources-json'),
  getLanShareStatus: () => ipcRenderer.invoke('get-lan-share-status'),
  restartLanServer: () => ipcRenderer.invoke('restart-lan-server'),
  stopLanServer: () => ipcRenderer.invoke('stop-lan-server'),
  notifyFirstScreenReady: () => ipcRenderer.send('app-first-screen-ready'),
  log: (level: string, scope: string, message: string) => ipcRenderer.send('log-message', { level, scope, message }),
  editVideoSegments: (params: { taskId: string, sourcePath: string, segments: Array<{ start: number, end: number }>, outputPath?: string, mode: 'replace' | 'saveAs' }) => ipcRenderer.invoke('edit-video-segments', params),
  cancelVideoEdit: (taskId: string) => ipcRenderer.invoke('cancel-video-edit', taskId),
  onVideoEditProgress: (taskId: string, callback: (data: { percent: number, text: string }) => void) => {
    const channel = `video-edit-progress-${taskId}`;
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  offVideoEditProgress: (taskId: string) => {
    ipcRenderer.removeAllListeners(`video-edit-progress-${taskId}`);
  },
  mergeVideos: (params: { taskId: string, videoPaths: string[], outputPath: string }) => ipcRenderer.invoke('merge-videos', params),
  cancelVideoMerge: (taskId: string) => ipcRenderer.invoke('cancel-video-merge', taskId),
  onVideoMergeProgress: (taskId: string, callback: (data: { percent: number, text: string }) => void) => {
    const channel = `video-merge-progress-${taskId}`;
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  offVideoMergeProgress: (taskId: string) => {
    ipcRenderer.removeAllListeners(`video-merge-progress-${taskId}`);
  },
  showSaveDialog: (options: { defaultPath?: string, title?: string, filters?: Array<{ name: string, extensions: string[] }> }) => ipcRenderer.invoke('show-save-dialog', options),
  getVideoQueueState: () => ipcRenderer.invoke('get-video-queue-state'),
  enqueueVideoTask: (params: any) => ipcRenderer.invoke('enqueue-video-task', params),
  cancelVideoTask: (taskId: string) => ipcRenderer.invoke('cancel-video-task', taskId),
  onVideoQueueStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('video-queue-state-changed', handler);
    return () => {
      ipcRenderer.removeListener('video-queue-state-changed', handler);
    };
  },
  onVideoTaskFinished: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('video-task-finished', handler);
    return () => {
      ipcRenderer.removeListener('video-task-finished', handler);
    };
  },
  onFileSystemChanged: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('file-system-changed', handler);
    return () => {
      ipcRenderer.removeListener('file-system-changed', handler);
    };
  },
  trayAction: (action: string) => ipcRenderer.send('tray-action', action),
  syncTrayPausedState: (hasPaused: boolean) => ipcRenderer.send('tray-paused-state', hasPaused),
  onTrayResumeAll: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('tray-resume-all', handler);
    return () => {
      ipcRenderer.removeListener('tray-resume-all', handler);
    };
  },
  onTrayPauseAll: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('tray-pause-all', handler);
    return () => {
      ipcRenderer.removeListener('tray-pause-all', handler);
    };
  },
  getPanAccounts: () => ipcRenderer.invoke('get-pan-accounts'),
  loginPanAccount: (type: string) => ipcRenderer.invoke('login-pan-account', type),
  logoutPanAccount: (type: string) => ipcRenderer.invoke('logout-pan-account', type),
  resolvePanResource: (params: { url: string; password?: string }) => ipcRenderer.invoke('resolve-pan-resource', params),
  listPanFiles: (params: { type: string; pdirFid?: string }) => ipcRenderer.invoke('pan-list-files', params),
  getPanDownloadUrls: (params: { type: string; fids: string[] }) => ipcRenderer.invoke('pan-get-download-urls', params),
  getPanShareDownloadUrls: (params: { type: string; items: Array<{ fid: string; fidToken?: string; pwdId?: string; stoken?: string; extra?: Record<string, any> }> }) =>
    ipcRenderer.invoke('pan-get-share-download-urls', params),
  deletePanFiles: (params: { type: string; fids: string[] }) => ipcRenderer.invoke('pan-delete-files', params),
  refreshPanQuota: (type: string) => ipcRenderer.invoke('pan-refresh-quota', type),
  createPanFolder: (params: { type: string; parentFid: string; name: string }) =>
    ipcRenderer.invoke('pan-create-folder', params),
  renamePanItem: (params: { type: string; fid: string; newName: string; isDirectory?: boolean }) =>
    ipcRenderer.invoke('pan-rename-item', params),
  movePanItems: (params: { type: string; fids: string[]; targetDirFid: string }) =>
    ipcRenderer.invoke('pan-move-items', params),
  createPanShare: (params: {
    type: string;
    params: {
      fids: string[];
      expireType: number;
      passcode?: string;
      fidsInfo?: Array<{ fid: string; isDirectory?: boolean }>;
    };
  }) => ipcRenderer.invoke('pan-create-share', params),
  savePanShare: (params: {
    type: string;
    items: Array<{ fid: string; fidToken?: string; pwdId?: string; stoken?: string; extra?: Record<string, any> }>;
    targetDirFid: string;
  }) => ipcRenderer.invoke('pan-save-share', params),
  getPanPreviewUrl: (params: { type: string; fid: string; filename?: string }) =>
    ipcRenderer.invoke('pan-get-preview-url', params),
  cleanupPanTempDir: (params: { type: string; cleanupDirFid: string }) =>
    ipcRenderer.invoke('pan-cleanup-temp-dir', params)
})

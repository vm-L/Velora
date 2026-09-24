/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
    minimize: () => void
    maximize: () => void
    close: () => void
    onWindowMaximized: (callback: () => void) => void
    onWindowUnmaximized: (callback: () => void) => void
    setSetting: (key: string, value: any) => void
    getSetting: (key: string) => Promise<any>
    getAllSettings: () => Promise<Record<string, any>>
    setCloseBehavior: (behavior: string) => void
    getCloseBehavior: () => Promise<string>
    onWebviewNewWindow: (callback: (data: { url: string, webContentsId: number }) => void) => void
    onMediaSniffed: (callback: (data: any) => void) => void
  offMediaSniffed: () => void
    getServerPort: () => Promise<number>
    copyImage: (url: string) => Promise<boolean>
    fetchImageBase64: (url: string) => Promise<string | null>
    fetchUrl: (url: string) => Promise<any>
    openExternal: (url: string) => void
    showItemInFolder: (filePath: string) => void
    openFile: (filePath: string) => Promise<{ success: boolean, code?: string, error?: string }>
    selectDirectory: () => Promise<string | undefined>
    saveImages: (dirPath: string, files: { url: string, name: string }[]) => Promise<any[]>
    startDownload: (cmd: any) => void
    pauseDownload: (id: string) => void
    cancelDownload: (id: string) => void
    getVideoMediaInfo: (filePath: string) => Promise<{ duration: number; bitrate: number; size: number }>
    compressVideoTask: (taskId: string, filePath: string, targetBitrateKbps: number) => Promise<{ success: boolean; newSize?: number; error?: string }>
    deleteFile: (filePath: string) => Promise<boolean>
    fileExists: (filePath: string) => Promise<boolean>
    moveFile: (oldPath: string, newPath: string) => Promise<{ success: boolean, error?: string }>
    getDirectoryTree: (rootDir: string, maxDepth?: number) => Promise<Array<{ path: string, name: string, depth: number }>>
    scanDirectoryMediaFiles: (rootDir: string, maxDepth?: number) => Promise<Array<{ name: string; path: string; dir: string; relativeDir: string }>>
    readLocalDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string; items: Array<{ name: string; path: string; isDirectory: boolean; size: number; mtime: number; ext: string }> }>
    createLocalFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
    deleteLocalPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
    scanLocalVideos: (targetPaths: string[]) => Promise<{ success: boolean; videos: Array<{ name: string; path: string; size: number }>; error?: string }>
    silentParseHtml: (targetUrl: string, scripts?: string[], evalExprs?: string[]) => Promise<{ success: boolean; html?: string; evaluatedVars?: Record<string, any>; error?: string }>
    setMediaReferer: (mediaUrl: string, pageUrl: string) => Promise<void>
    createMediaClient: (config: { clientId: string, referer: string, origin?: string }) => Promise<void>
    destroyMediaClient: (clientId: string) => Promise<void>
    onDownloadProgress: (callback: (data: any) => void) => void
    syncAdBlockSource: (url: string) => Promise<{ success: boolean, count: number, content?: string, error?: string }>
    compileAdBlockRules: (sourcesData: Record<string, string>) => Promise<number>
    exportResourcesJson: (data: any) => Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>
    importResourcesJson: () => Promise<{ success: boolean; cancelled?: boolean; data?: any; error?: string }>
    getLanShareStatus: () => Promise<{ running: boolean; port: number; ip: string; url: string; hasPassword: boolean; allowEdit: boolean }>
    restartLanServer: () => Promise<{ success: boolean; port?: number; error?: string; running?: boolean }>
    stopLanServer: () => Promise<{ success: boolean }>
    notifyFirstScreenReady: () => void
    log: (level: 'info' | 'warn' | 'error' | 'perf', scope: string, message: string) => void
    editVideoSegments: (params: { taskId: string, sourcePath: string, segments: Array<{ start: number, end: number }>, outputPath?: string, mode: 'replace' | 'saveAs' }) => Promise<{ success: boolean, outputPath?: string, error?: string }>
    cancelVideoEdit: (taskId: string) => Promise<boolean>
    onVideoEditProgress: (taskId: string, callback: (data: { percent: number, text: string }) => void) => void
    offVideoEditProgress: (taskId: string) => void
    mergeVideos: (params: { taskId: string, videoPaths: string[], outputPath: string }) => Promise<{ success: boolean, outputPath?: string, error?: string }>
    cancelVideoMerge: (taskId: string) => Promise<boolean>
    onVideoMergeProgress: (taskId: string, callback: (data: { percent: number, text: string }) => void) => void
    offVideoMergeProgress: (taskId: string) => void
    showSaveDialog: (options: { defaultPath?: string, title?: string, filters?: Array<{ name: string, extensions: string[] }> }) => Promise<{ canceled: boolean, filePath?: string }>
  }
}


declare global {
  interface Window {
    __SERVER_PORT__?: number;
  }
}

declare var __SERVER_PORT__: number | undefined;

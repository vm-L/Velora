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
    deleteFile: (filePath: string) => Promise<boolean>
    fileExists: (filePath: string) => Promise<boolean>
    moveFile: (oldPath: string, newPath: string) => Promise<{ success: boolean, error?: string }>
    getDirectoryTree: (rootDir: string, maxDepth?: number) => Promise<Array<{ path: string, name: string, depth: number }>>
    silentParseHtml: (targetUrl: string, scripts?: string[], evalExprs?: string[]) => Promise<{ success: boolean; html?: string; evaluatedVars?: Record<string, any>; error?: string }>
    setMediaReferer: (mediaUrl: string, pageUrl: string) => Promise<void>
    createMediaClient: (config: { clientId: string, referer: string, origin?: string }) => Promise<void>
    destroyMediaClient: (clientId: string) => Promise<void>
    onDownloadProgress: (callback: (data: any) => void) => void
    syncAdBlockSource: (url: string) => Promise<{ success: boolean, count: number, content?: string, error?: string }>
    compileAdBlockRules: (sourcesData: Record<string, string>) => Promise<number>
    exportResourcesJson: (data: any) => Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }>
    importResourcesJson: () => Promise<{ success: boolean; cancelled?: boolean; data?: any; error?: string }>
    getPageCredentials: (pageUrl: string) => Promise<{ success: boolean; referer?: string; userAgent?: string; cookie?: string; error?: string }>
    log: (level: 'info' | 'warn' | 'error', scope: string, message: string) => void
  }
}


declare global {
  interface Window {
    __SERVER_PORT__?: number;
  }
}

declare var __SERVER_PORT__: number | undefined;

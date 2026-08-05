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
    onDownloadProgress: (callback: (data: any) => void) => void
    syncAdBlockSource: (url: string) => Promise<{ success: boolean, count: number, content?: string, error?: string }>
    compileAdBlockRules: (sourcesData: Record<string, string>) => Promise<number>
    log: (level: 'info' | 'warn' | 'error', scope: string, message: string) => void
  }
}


declare global {
  interface Window {
    __SERVER_PORT__?: number;
  }
}

declare var __SERVER_PORT__: number | undefined;
